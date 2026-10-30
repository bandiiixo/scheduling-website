/* =========================================================
   KNG SCHEDULE
   ========================================================= */

const app = document.getElementById("app");

let currentDate = new Date();
let currentView = "month";
let events = [];
let allEvents = [];
let eventTypes = [];
let staff = [];
let currentUser = null;
let currentAccess = null;
let selectedEvent = null;

// Integrated KNG operations layer
let opsView = localStorage.getItem("kng.opsView") || "schedule";
let ops = { tracker: [], points: [], hungry: [], reductions: [], audit: [], security: [], prizes: [], helpers: [], prizeWins: [], timeouts: [], blocks: [] };
let accessBlock = null;
let currentTimeout = null;
let accessRequests = [];
let opsLoadErrors = {};
let ixView = localStorage.getItem("kng.ixView") || "";
let hostPlannerDate = localStorage.getItem("kng.hostPlannerDate") || formatDate(new Date());
let ixData = { hof: [], goals: [], suggestions: [] };
let rosterData = [];
let crashoutSettings = { max_removals: 3, window_minutes: 60, timeout_minutes: 30 };
if (opsView === "logs" || opsView === "announcements") opsView = "schedule";
if (ixView === "announcements" || ixView === "logs") ixView = "command-dashboard";
let ixLoadErrors = {};


/* =========================================================
   INITIALISE
   ========================================================= */

async function init() {
    try {
        const { data } = await supabaseClient.auth.getSession();

        currentUser = data?.session?.user || null;

        await loadAccess();
        await loadEventTypes();
        await loadStaff();
        await loadEvents();
        await loadAccessRequests();
        await loadOpsData();
        await loadInteractionData();
        await loadRosterData();

        render();

        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            currentUser = session?.user || null;

            await loadAccess();
            await loadAccessRequests();
            await loadOpsData();
            await loadInteractionData();
            await loadRosterData();
            render();
        });

        setInterval(async () => {
            await loadAccess();
            await loadAccessRequests();
            await loadEvents();
            if (opsView !== "schedule") await loadOpsData();
            await loadInteractionData();
            await loadRosterData();
            render();
        }, 60000);

    } catch (error) {
        console.error(error);

        app.innerHTML = `
            <div class="schedule-error">
                <h1>KNG Schedule</h1>
                <p>Something went wrong while loading the schedule.</p>
                <pre>${escapeHtml(error.message || String(error))}</pre>
            </div>
        `;
    }
}


/* =========================================================
   DATABASE
   ========================================================= */

async function loadEventTypes() {
    const { data, error } = await supabaseClient
        .from("event_types")
        .select("*")
        .order("name");

    if (error) throw error;

    eventTypes = data || [];
}


async function loadStaff() {
    const { data, error } = await supabaseClient
        .from("staff")
        .select("*")
        .eq("active", true)
        .order("name");

    if (error) throw error;

    staff = data || [];
}


async function loadEvents() {
    const { data, error } = await supabaseClient
        .from("events")
        .select(`
            *,
            event_types (
                id,
                name,
                colour,
                description
            ),
            event_staff (
                id,
                staff_id,
                role,
                staff (
                    id,
                    name,
                    discord_id
                )
            )
        `)
        .order("event_date")
        .order("start_time");

    if (error) throw error;

    allEvents = data || [];
    applyEventVisibility();
}

function canViewStaffEvents() {
    // Any confirmed KNG staff member can see staff-only meetings/events.
    // Players/public visitors must never receive them in the UI.
    return permissionRank() >= 1;
}

function applyEventVisibility() {
    events = (allEvents || []).filter(e => canViewStaffEvents() || (e.visibility || "public") !== "staff");
}


async function loadAccess() {
    currentAccess = null;
    accessBlock = null;
    currentTimeout = null;

    if (!currentUser) return;

    const email = String(currentUser.email || "").toLowerCase();
    const now = new Date().toISOString();

    const [accessResult, blockResult, timeoutResult] = await Promise.all([
        supabaseClient.from("staff_access").select("access_level, active").eq("user_id", currentUser.id).eq("active", true).maybeSingle(),
        supabaseClient.from("ops_access_blocks").select("*").eq("email", email).eq("active", true).maybeSingle(),
        supabaseClient.from("ops_timeouts").select("*").eq("email", email).gt("expires_at", now).order("expires_at", { ascending: false }).limit(1).maybeSingle()
    ]);

    if (accessResult.error) console.error("Access check failed:", accessResult.error);
    if (blockResult.error && !String(blockResult.error.message || "").includes("does not exist")) console.error("Block check failed:", blockResult.error);
    if (timeoutResult.error && !String(timeoutResult.error.message || "").includes("does not exist")) console.error("Timeout check failed:", timeoutResult.error);

    currentAccess = accessResult.data || null;
    accessBlock = blockResult.data || null;
    currentTimeout = timeoutResult.data || null;

    applyEventVisibility();

    if (accessBlock || currentTimeout) {
        opsView = "schedule";
    }
}


async function loadAccessRequests() {
    accessRequests = [];
    if (!currentUser || !canApproveAccess()) return;

    const { data, error } = await supabaseClient
        .from("staff_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);

    if (error) {
        if (!String(error.message || "").includes("does not exist")) console.error("Access requests failed:", error);
        return;
    }
    accessRequests = data || [];
}

function getDiscordIdentity() {
    const identity = (currentUser?.identities || []).find(i => i.provider === "discord");
    const data = identity?.identity_data || {};
    const discordId = identity?.provider_id || data?.provider_id || data?.id || data?.sub || null;
    const username = data?.global_name || data?.username || currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email || "Discord user";
    return { discordId: discordId ? String(discordId) : null, username: String(username) };
}

async function requestStaffAccess() {
    if (!currentUser) return openLogin();
    if (currentAccess) return;

    const requestedLevel = nextRequestedAccessLevel();
    if (!requestedLevel) return;
    const { data, error } = await supabaseClient.rpc("request_staff_access", { p_requested_access_level: requestedLevel });
    if (error) {
        console.error(error);
        showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">Access</span><h2>Request failed</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><p class="modal-message">${escapeHtml(error.message)}</p><div class="modal-footer"><button class="primary-button" onclick="closeModal()">Close</button></div></div>`);
        return;
    }

    await loadAccessRequests();
    showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">Access</span><h2>Request sent</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><p class="modal-message">Your Discord account has been sent to staff for confirmation.</p><div class="modal-footer"><button class="primary-button" onclick="closeModal();render();">Done</button></div></div>`);
}


async function approveAccessRequest(requestId, accessLevel) {
    if (!canApproveAccess()) return;
    const { error } = await supabaseClient.rpc("approve_staff_access_request", { p_request_id: requestId, p_access_level: accessLevel });
    if (error) { alert(error.message); return; }
    await loadAccessRequests();
    await loadOpsData();
    render();
}

async function rejectAccessRequest(requestId) {
    if (!canApproveAccess()) return;
    const reason = prompt("Reason for rejecting this access request:", "Not confirmed as KNG staff");
    if (reason === null) return;
    const { error } = await supabaseClient.rpc("reject_staff_access_request", { p_request_id: requestId, p_reason: reason });
    if (error) { alert(error.message); return; }
    await loadAccessRequests();
    render();
}

function getPermissionLevel() {
    // Signing in proves identity, not permission. Until staff explicitly
    // confirms the account, an authenticated user remains PUBLIC.
    if (!currentUser || !currentAccess) return "public";
    return currentAccess.access_level || "public";
}

function permissionRank(level = getPermissionLevel()) {
    return ({ public: 0, member: 1, adm: 2, manager: 3, director: 4 }[level] ?? 0);
}

function hasPermission(level) {
    return permissionRank() >= permissionRank(level);
}

function canManage() {
    return hasPermission("adm");
}

function canEntertainment() {
    return hasPermission("adm");
}

function isAdmin() {
    return hasPermission("manager");
}

function isDirector() {
    return getPermissionLevel() === "director";
}

function canApproveAccess() {
    return hasPermission("adm");
}

function nextRequestedAccessLevel() {
    const next = ({ public: "member", member: "adm", adm: "manager", manager: "director" })[getPermissionLevel()];
    return next || null;
}

function availableGrantLevels() {
    const rank = permissionRank();
    return [
        ["member", "Member", 1],
        ["adm", "ADM", 2],
        ["manager", "Manager", 3]
    ].filter(([, , targetRank]) => rank >= targetRank + 1);
}


/* =========================================================
   RENDER
   ========================================================= */

function render() {
    const ixViews = ["command-dashboard","interactions-leaderboard","hall-of-fame","daily-goals","staff-roster","event-suggestions"];
    if (accessBlock || currentTimeout) {
        renderAccessRestriction();
        return;
    }
    if (ixViews.includes(ixView)) { renderInteractionView(); return; }
    if (opsView !== "schedule") {
        renderOperations();
        return;
    }

    app.innerHTML = `
        <div class="schedule-app">

            <header class="schedule-header">

                <div class="schedule-brand">
                    <div class="schedule-logo crown-logo">♛</div>

                    <div>
                        <h1>KNG Entertainment</h1>
                        <span>Events &amp; Community Planning</span>
                    </div>
                </div>

                <div class="schedule-header-actions">

    ${
        canManage()
            ? `
                <span class="mode-badge staff-mode">
                    STAFF MODE
                </span>

                <button class="primary-button"
                    onclick="openCreateEventModal()">
                    + Create Event
                </button>

                ${isAdmin() ? `<button class="header-button" onclick="openCreateMeetingModal()">+ Meeting</button>` : ""}

                <button class="header-button"
                    onclick="logout()">
                    Logout
                </button>
              `
            : `
                <span class="mode-badge player-mode">
                    ${currentUser ? `${String(getPermissionLevel()).toUpperCase()} ACCESS` : "PUBLIC VIEW"}
                </span>

                ${currentUser ? `${nextRequestedAccessLevel() ? `<button class="header-button" onclick="requestStaffAccess()">Request ${String(nextRequestedAccessLevel()).toUpperCase()} Access</button>` : ""}<button class="header-button" onclick="logout()">Logout</button>` : `<button class="header-button" onclick="openLogin()">Discord Login</button>`}
              `
    }

    <button class="header-button"
        onclick="goToday()">
        Today
    </button>

</div>

            </header>


            <div class="app-body">
                ${operationsNavHtml()}
                <main class="schedule-main">

                <section class="calendar-toolbar">

                    <div class="calendar-navigation">

                        <button onclick="previousPeriod()"
                            aria-label="Previous">
                            ‹
                        </button>

                        <h2 id="calendarTitle"></h2>

                        <button onclick="nextPeriod()"
                            aria-label="Next">
                            ›
                        </button>

                    </div>


                    <div class="view-switcher">

                        <button
                            class="${currentView === "month" ? "active" : ""}"
                            onclick="setView('month')">
                            Month
                        </button>

                        <button
                            class="${currentView === "week" ? "active" : ""}"
                            onclick="setView('week')">
                            Week
                        </button>

                        <button
                            class="${currentView === "day" ? "active" : ""}"
                            onclick="setView('day')">
                            Day
                        </button>

                        <button
                            class="${currentView === "agenda" ? "active" : ""}"
                            onclick="setView('agenda')">
                            Agenda
                        </button>

                    </div>

                </section>


                <section id="calendarContainer"
                    class="calendar-container">
                </section>

                </main>
            </div>

        </div>

        <div id="modalContainer"></div>
    `;

    renderCalendar();
}


/* =========================================================
   CALENDAR VIEWS
   ========================================================= */

function renderCalendar() {
    const container = document.getElementById("calendarContainer");

    if (!container) return;

    if (currentView === "month") {
        renderMonth(container);
        return;
    }

    if (currentView === "week") {
        renderWeek(container);
        return;
    }

    if (currentView === "day") {
        renderDay(container);
        return;
    }

    if (currentView === "agenda") {
        renderAgenda(container);
    }
}


/* =========================================================
   MONTH
   ========================================================= */

function renderMonth(container) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById("calendarTitle").textContent =
        currentDate.toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric"
        });

    const firstDay = new Date(year, month, 1);

    let startOffset = firstDay.getDay();

    // Monday-start calendar
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const previousMonthDays =
        new Date(year, month, 0).getDate();

    let html = `
        <div class="month-calendar">

            <div class="weekday-row">
                ${[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday"
                ].map(day => `<div>${day}</div>`).join("")}
            </div>

            <div class="month-grid">
    `;

    const totalCells = Math.ceil(
        (startOffset + daysInMonth) / 7
    ) * 7;


    for (let i = 0; i < totalCells; i++) {

        let dayNumber;
        let date;
        let outsideMonth = false;

        if (i < startOffset) {

            dayNumber =
                previousMonthDays - startOffset + i + 1;

            date = new Date(
                year,
                month - 1,
                dayNumber
            );

            outsideMonth = true;

        } else if (i >= startOffset + daysInMonth) {

            dayNumber =
                i - (startOffset + daysInMonth) + 1;

            date = new Date(
                year,
                month + 1,
                dayNumber
            );

            outsideMonth = true;

        } else {

            dayNumber = i - startOffset + 1;

            date = new Date(
                year,
                month,
                dayNumber
            );
        }


        const dateString = formatDate(date);

        const dayEvents = events.filter(event =>
            event.event_date === dateString
        );

        const todayClass =
            isToday(date) ? " today" : "";

        const outsideClass =
            outsideMonth ? " outside-month" : "";


        html += `
            <div
                class="month-cell${todayClass}${outsideClass}"
                onclick="handleDateClick('${dateString}')"
            >

                <div class="month-cell-header">
                    <span class="month-day-number">${dayNumber}</span>
                </div>

                <div class="month-events">

                    ${dayEvents.map(event =>
                        renderCalendarEvent(event)
                    ).join("")}

                </div>

            </div>
        `;
    }


    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}


/* =========================================================
   WEEK
   ========================================================= */

function renderWeek(container) {

    const start = startOfWeek(currentDate);

    const days = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        days.push(date);
    }


    document.getElementById("calendarTitle").textContent =
        `${formatShortDate(days[0])} - ${formatShortDate(days[6])}`;


    let html = `
        <div class="week-calendar">

            <div class="week-header">

                <div class="time-column-header"></div>

                ${days.map(date => `
                    <div class="
                        week-day-header
                        ${isToday(date) ? "today" : ""}
                    ">
                        <span>
                            ${date.toLocaleDateString("en-GB", {
                                weekday: "short"
                            })}
                        </span>

                        <strong>
                            ${date.getDate()}
                        </strong>
                    </div>
                `).join("")}

            </div>

            <div class="week-body">
    `;


    for (let hour = 0; hour < 24; hour++) {

        html += `
            <div class="week-row">

                <div class="time-label">
                    ${String(hour).padStart(2, "0")}:00
                </div>
        `;


        days.forEach(date => {

            const dateString = formatDate(date);

            const hourEvents = events.filter(event => {
                if (event.event_date !== dateString) return false;

                const startHour =
                    parseInt(event.start_time.split(":")[0]);

                return startHour === hour;
            });


            html += `
                <div
                    class="week-cell"
                    onclick="handleDateClick('${dateString}', ${hour})"
                >

                    ${hourEvents.map(event =>
                        renderCalendarEvent(event)
                    ).join("")}

                </div>
            `;
        });


        html += `</div>`;
    }


    html += `
            </div>
        </div>
    `;


    container.innerHTML = html;
}


/* =========================================================
   DAY
   ========================================================= */

function renderDay(container) {

    document.getElementById("calendarTitle").textContent =
        currentDate.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });


    const dateString = formatDate(currentDate);

    let html = `
        <div class="day-calendar">

            <div class="day-header">
                ${currentDate.toLocaleDateString("en-GB", {
                    weekday: "long"
                })}
                <strong>
                    ${currentDate.getDate()}
                </strong>
            </div>

            <div class="day-body">
    `;


    for (let hour = 0; hour < 24; hour++) {

        const hourEvents = events.filter(event => {

            if (event.event_date !== dateString) {
                return false;
            }

            return parseInt(
                event.start_time.split(":")[0]
            ) === hour;
        });


        html += `
            <div class="day-row">

                <div class="time-label">
                    ${String(hour).padStart(2, "0")}:00
                </div>

                <div
                    class="day-cell"
                    onclick="handleDateClick('${dateString}', ${hour})"
                >

                    ${hourEvents.map(event =>
                        renderCalendarEvent(event)
                    ).join("")}

                </div>

            </div>
        `;
    }


    html += `
            </div>
        </div>
    `;


    container.innerHTML = html;
}


/* =========================================================
   AGENDA
   ========================================================= */

function renderAgenda(container) {

    document.getElementById("calendarTitle").textContent =
        "Upcoming Events";


    const sortedEvents = [...events].sort((a, b) => {

        const first =
            `${a.event_date} ${a.start_time}`;

        const second =
            `${b.event_date} ${b.start_time}`;

        return first.localeCompare(second);
    });


    if (!sortedEvents.length) {

        container.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">📅</div>

                <h3>No events scheduled</h3>

                <p>
                    There aren't any events in the schedule yet.
                </p>

            </div>
        `;

        return;
    }


    const grouped = {};


    sortedEvents.forEach(event => {

        if (!grouped[event.event_date]) {
            grouped[event.event_date] = [];
        }

        grouped[event.event_date].push(event);
    });


    let html = `<div class="agenda-list">`;


    Object.entries(grouped).forEach(([date, dateEvents]) => {

        const parsedDate =
            new Date(`${date}T00:00:00`);


        html += `
            <section class="agenda-day">

                <div class="agenda-date">

                    <strong>
                        ${parsedDate.toLocaleDateString(
                            "en-GB",
                            { weekday: "long" }
                        )}
                    </strong>

                    <span>
                        ${parsedDate.toLocaleDateString(
                            "en-GB",
                            {
                                day: "numeric",
                                month: "long",
                                year: "numeric"
                            }
                        )}
                    </span>

                </div>
        `;


        dateEvents.forEach(event => {

            html += renderAgendaEvent(event);

        });


        html += `
            </section>
        `;
    });


    html += `</div>`;


    container.innerHTML = html;
}


/* =========================================================
   EVENT DISPLAY
   ========================================================= */

function renderCalendarEvent(event) {
    const colour = event.event_types?.colour || "#3b82f6";
    const type = event.event_types?.name || "Event";
    const allocated = event.event_staff?.length || 0;
    const required = event.staff_required || 0;
    const completed = isEventCompleted(event);
    return `<div class="calendar-event ${completed ? 'event-completed' : ''}" style="--event-colour:${colour}" onclick="event.stopPropagation(); openEvent('${event.id}')">
        <span class="event-time">${formatTime(event.start_time)}</span>
        <strong>${escapeHtml(event.title)}</strong>
        <span class="event-type">${escapeHtml(type)}</span>
        ${event.winner_name ? `<span class="event-winner">🏆 ${escapeHtml(event.winner_name)}</span>` : ''}
        ${Number.isFinite(Number(event.attendance_count)) && event.attendance_count !== null ? `<span class="event-attendance">👥 ${Number(event.attendance_count)}</span>` : ''}
        ${required > 0 ? `<span class="event-staff">${allocated}/${required} staff</span>` : ""}
        ${completed ? `<span class="event-status">COMPLETED</span>` : ''}
    </div>`;
}

function renderAgendaEvent(event) {

    const colour =
        event.event_types?.colour || "#3b82f6";

    const allocated =
        event.event_staff?.length || 0;

    const required =
        event.staff_required || 0;


    return `
        <article
            class="agenda-event"
            style="--event-colour:${colour}"
            onclick="openEvent('${event.id}')"
        >

            <div class="agenda-event-time">

                <strong>
                    ${formatTime(event.start_time)}
                </strong>

                <span>
                    ${formatTime(event.end_time)}
                </span>

            </div>


            <div class="agenda-event-main">

                <div class="agenda-event-title">
                    ${escapeHtml(event.title)}
                </div>

                <div class="agenda-event-meta">

                    ${
                        event.event_types?.name
                            ? `<span>
                                ${escapeHtml(
                                    event.event_types.name
                                )}
                               </span>`
                            : ""
                    }

                    ${
                        event.location
                            ? `<span>
                                📍 ${escapeHtml(event.location)}
                               </span>`
                            : ""
                    }

                    ${
                        required > 0
                            ? `<span>
                                👥 ${allocated}/${required} staff
                               </span>`
                            : ""
                    }

                </div>

            </div>

        </article>
    `;
}


/* =========================================================
   EVENT MODALS
   ========================================================= */

function openCreateEventModal(date = null, hour = null) {

    if (!canManage()) {
        showLoginMessage();
        return;
    }


    const defaultDate =
        date || formatDate(currentDate);

    const defaultStart =
        hour !== null
            ? `${String(hour).padStart(2, "0")}:00`
            : "19:00";


    const defaultEnd =
        hour !== null
            ? `${String(Math.min(hour + 1, 23))
                .padStart(2, "0")}:00`
            : "20:00";


    selectedEvent = null;


    showModal(`
        <div class="modal">

            <div class="modal-header">

                <div>
                    <span class="modal-eyebrow">
                        KNG Entertainment · New Event
                    </span>

                    <h2>Create Entertainment Event</h2>
                </div>

                <button
                    class="modal-close"
                    onclick="closeModal()">
                    ×
                </button>

            </div>


            <form onsubmit="createEvent(event)">

                <div class="form-grid">

                    <div class="form-field full">
                        <label>Event title</label>

                        <input
                            id="eventTitle"
                            required
                            maxlength="120"
                            placeholder="e.g. Battle Royale"
                        >
                        <div class="quick-event-presets">
                            <button type="button" class="quick-event" onclick="applyEventPreset('Party')">PARTY</button>
                            <button type="button" class="quick-event" onclick="applyEventPreset('Event')">EVENT</button>
                            <button type="button" class="quick-event" onclick="applyEventPreset('Battle Royale')">BATTLE ROYALE</button>
                            ${isAdmin()?`<button type="button" class="quick-event" onclick="applyEventPreset('Community Meeting')">COMMUNITY MEETING</button>`:""}
                        </div>
                    </div>


                    <div class="form-field">
                        <label>Event type</label>

                        <select id="eventType" required>

                            ${eventTypes.map(type => `
                                <option value="${type.id}">
                                    ${escapeHtml(type.name)}
                                </option>
                            `).join("")}

                        </select>
                    </div>


                    <div class="form-field">
                        <label>Date</label>

                        <input
                            id="eventDate"
                            type="date"
                            value="${defaultDate}"
                            required
                        >
                    </div>


                    <div class="form-field">
                        <label>Start time</label>

                        <input
                            id="eventStart"
                            type="time"
                            value="${defaultStart}"
                            required
                        >
                    </div>


                    <div class="form-field">
                        <label>End time</label>

                        <input
                            id="eventEnd"
                            type="time"
                            value="${defaultEnd}"
                            required
                        >
                    </div>


                    <div class="form-field full">
                        <label>Location</label>

                        <input
                            id="eventLocation"
                            maxlength="150"
                            placeholder="Optional"
                        >
                    </div>


                    <div class="form-field">
                        <label>Staff required</label>

                        <input
                            id="eventStaffRequired"
                            type="number"
                            min="0"
                            value="0"
                        >
                    </div>


                    <div class="form-field">
                        <label>Visibility</label>
                        <select id="eventVisibility">
                            <option value="public">Player visible</option>
                            <option value="staff">Staff only</option>
                        </select>
                    </div>

                    <div class="form-field">
                        <label>Repeat</label>
                        <select id="eventRepeat">
                            <option value="none">Does not repeat</option>
                            <option value="weekly">Every week</option>
                            <option value="biweekly">Every 2 weeks</option>
                            <option value="monthly">Every month</option>
                        </select>
                    </div>

                    <div class="form-field">
                        <label>Repeat until</label>
                        <input id="eventRepeatUntil" type="date" value="${formatDate(new Date(Date.now()+90*86400000))}">
                    </div>

                    <div class="form-field full">
                        <label>Description</label>

                        <textarea
                            id="eventDescription"
                            rows="5"
                            maxlength="2000"
                            placeholder="Event details..."
                        ></textarea>
                    </div>

                </div>


                <div id="eventFormError"
                    class="form-error">
                </div>


                <div class="modal-footer">

                    <button
                        type="button"
                        class="secondary-button"
                        onclick="closeModal()">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="primary-button">
                        Create Event
                    </button>

                </div>

            </form>

        </div>
    `);
}


function openCreateMeetingModal() {
    if (!isAdmin()) return;
    showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">KNG Management · Staff Meeting</span><h2>Add Meeting</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form onsubmit="createMeeting(event)"><div class="form-grid"><div class="form-field full"><label>Meeting title</label><input id="meetingTitle" required maxlength="120" placeholder="e.g. Management Meeting"></div><div class="form-field"><label>Date</label><input id="meetingDate" type="date" value="${formatDate(currentDate)}" required></div><div class="form-field"><label>Start time</label><input id="meetingStart" type="time" value="19:00" required></div><div class="form-field"><label>End time</label><input id="meetingEnd" type="time" value="20:00" required></div><div class="form-field"><label>Repeat</label><select id="meetingRepeat"><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Every month</option></select></div><div class="form-field"><label>Repeat until</label><input id="meetingRepeatUntil" type="date" value="${formatDate(new Date(Date.now()+90*86400000))}"></div><div class="form-field full"><label>Meeting notes</label><textarea id="meetingDescription" rows="5" maxlength="2000" placeholder="Agenda, attendees, notes..."></textarea></div></div><div id="meetingFormError" class="form-error"></div><div class="modal-footer"><button type="button" class="secondary-button" onclick="closeModal()">Cancel</button><button type="submit" class="primary-button">Add Meeting</button></div></form></div>`);
}

async function createMeeting(e) {
    e.preventDefault(); if (!isAdmin()) return;
    const title=document.getElementById("meetingTitle").value.trim(); const date=document.getElementById("meetingDate").value; const start=document.getElementById("meetingStart").value; const end=document.getElementById("meetingEnd").value; const repeat=document.getElementById("meetingRepeat").value; const until=document.getElementById("meetingRepeatUntil").value; const description=document.getElementById("meetingDescription").value.trim();
    const err=document.getElementById("meetingFormError");
    if(end<=start){err.textContent="End time must be later than start time."; return;}
    if(repeat!=="none" && until < date){err.textContent="Repeat until must be on or after the first meeting date."; return;}
    const meetingType = eventTypes.find(t => String(t.name||"").toLowerCase() === "staff meeting") || eventTypes.find(t => String(t.name||"").toLowerCase() === "community meeting");
    if (!meetingType) { err.textContent="Staff Meeting event type is missing."; return; }
    const dates=buildRecurringDates(date, repeat, until); const recurrenceGroupId=crypto.randomUUID();
    const rows=dates.map(d=>({title,event_type_id:meetingType.id,event_date:d,start_time:start,end_time:end,location:null,description:description||null,staff_required:0,visibility:"staff",recurrence_group_id:dates.length>1?recurrenceGroupId:null,recurrence_rule:repeat==="none"?null:repeat,status:"scheduled",is_meeting:true,created_by:currentUser?.id||null,updated_by:currentUser?.id||null}));
    const {error}=await supabaseClient.from("events").insert(rows); if(error){err.textContent=error.message;return;}
    await writeAudit("meeting.created",{title,dates,repeat}); closeModal(); await loadEvents(); render();
}

async function createEvent(event) {

    event.preventDefault();


    const errorBox =
        document.getElementById("eventFormError");

    errorBox.textContent = "";


    const title =
        document.getElementById("eventTitle").value.trim();

    const eventTypeId =
        document.getElementById("eventType").value;

    const eventDate =
        document.getElementById("eventDate").value;

    const startTime =
        document.getElementById("eventStart").value;

    const endTime =
        document.getElementById("eventEnd").value;

    const location =
        document.getElementById("eventLocation").value.trim();

    const staffRequired =
        parseInt(
            document.getElementById(
                "eventStaffRequired"
            ).value
        ) || 0;

    const description =
        document.getElementById(
            "eventDescription"
        ).value.trim();

    let visibility = document.getElementById("eventVisibility")?.value || "public";
    const repeat = document.getElementById("eventRepeat")?.value || "none";
    const repeatUntil = document.getElementById("eventRepeatUntil")?.value || eventDate;
    const selectedType = eventTypes.find(t => t.id === eventTypeId);
    const isMeeting = ["staff meeting", "community meeting"].includes(String(selectedType?.name || "").toLowerCase());
    if (isMeeting && !isAdmin()) { errorBox.textContent = "Only Managers and Directors can create meetings."; return; }
    if (isMeeting) visibility = "staff";


    if (endTime <= startTime) {

        errorBox.textContent =
            "End time must be later than start time.";

        return;
    }

    if (repeat !== "none" && repeatUntil < eventDate) {
        errorBox.textContent = "Repeat until must be on or after the first event date.";
        return;
    }


    const recurrenceGroupId = crypto.randomUUID();
    const dates = buildRecurringDates(eventDate, repeat, repeatUntil);
    const rows = dates.map(d => ({
        title,
        event_type_id: eventTypeId,
        event_date: d,
        start_time: startTime,
        end_time: endTime,
        location: location || null,
        description: description || null,
        staff_required: staffRequired,
        visibility,
        recurrence_group_id: dates.length > 1 ? recurrenceGroupId : null,
        recurrence_rule: repeat === "none" ? null : repeat,
        status: "scheduled",
        is_meeting: isMeeting,
        created_by: currentUser?.id || null,
        updated_by: currentUser?.id || null
    }));

    const { error } = await supabaseClient.from("events").insert(rows);

    if (error) {
        errorBox.textContent = error.message;
        return;
    }

    await writeAudit("event.created", { title, dates, visibility, repeat });


    closeModal();

    await loadEvents();

    render();
}


/* =========================================================
   EVENT DETAILS
   ========================================================= */

async function openEvent(eventId) {
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    selectedEvent = event;
    const feedbackResult = await supabaseClient.from("event_feedback").select("display_name,rating,feedback,created_at").eq("event_id", event.id).order("created_at", {ascending:false}).limit(5);
    const suggestionResult = await supabaseClient.from("event_suggestions").select("display_name,suggestion,created_at,status").eq("event_id", event.id).order("created_at", {ascending:false}).limit(5);
    const feedbackRows = feedbackResult.error ? [] : (feedbackResult.data || []);
    const suggestionRows = suggestionResult.error ? [] : (suggestionResult.data || []);
    const feedbackAverage = feedbackRows.length ? (feedbackRows.reduce((n,r)=>n+Number(r.rating||0),0)/feedbackRows.length).toFixed(1) : null;
    const colour = event.event_types?.colour || "#3b82f6";
    const allocations = event.event_staff || [];
    const passed = new Date(`${event.event_date}T${event.end_time}`) <= new Date();
    const canComplete = canManage() && !event.is_meeting && passed && !isEventCompleted(event);
    const completedLabel = isEventCompleted(event) ? `<div class="event-completion-summary"><b>Completed</b>${event.attendance_count !== null && event.attendance_count !== undefined ? `<span>Attendance: ${Number(event.attendance_count)}</span>` : ''}${event.winner_name ? `<span>Winner: ${escapeHtml(event.winner_name)}</span>` : ''}</div>` : '';
    showModal(`<div class="modal event-detail-modal">
        <div class="event-detail-accent" style="background:${colour}"></div>
        <div class="modal-header"><div><span class="modal-eyebrow">${escapeHtml(event.event_types?.name || "Event")}</span><h2>${escapeHtml(event.title)}</h2></div><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="event-detail-content">
            <div class="event-detail-row"><span>📅</span><div><strong>Date</strong><p>${formatDisplayDate(event.event_date)}</p></div></div>
            <div class="event-detail-row"><span>⏰</span><div><strong>Time</strong><p>${formatTime(event.start_time)} - ${formatTime(event.end_time)}</p></div></div>
            ${event.location ? `<div class="event-detail-row"><span>📍</span><div><strong>Location</strong><p>${escapeHtml(event.location)}</p></div></div>` : ''}
            ${event.description ? `<div class="event-detail-description"><strong>Description</strong><p>${escapeHtml(event.description).replace(/\n/g,'<br>')}</p></div>` : ''}
            ${event.winner_name ? `<div class="event-detail-description"><strong>🏆 Winner</strong><p>${escapeHtml(event.winner_name)}</p></div>` : ''}
            ${event.attendance_count !== null && event.attendance_count !== undefined ? `<div class="event-detail-description"><strong>👥 Attendance</strong><p>${Number(event.attendance_count)} people attended</p></div>` : ''}
            ${event.staff_required > 0 ? `<div class="staff-section"><div class="staff-section-header"><div><strong>Staff Allocation</strong><span>${allocations.length}/${event.staff_required}</span></div>${canManage()?`<button class="secondary-button" onclick="openStaffAllocation('${event.id}')">Manage Staff</button>`:''}</div>${allocations.length?`<div class="allocated-staff">${allocations.map(a=>`<div class="staff-chip"><span>${escapeHtml(a.staff?.name||"Unknown")}</span>${a.role?`<small>${escapeHtml(a.role)}</small>`:''}</div>`).join('')}</div>`:`<div class="no-staff">No staff allocated yet.</div>`}</div>`:''}
            ${completedLabel}
            <div class="event-feedback-box"><div class="feedback-actions"><button class="secondary-button" onclick="openEventFeedbackModal('${event.id}','feedback')">Give Feedback</button><button class="secondary-button" onclick="openEventFeedbackModal('${event.id}','suggestion')">Suggest an Improvement</button></div>${feedbackAverage?`<div class="feedback-summary"><b>Public feedback: ${feedbackAverage}/5</b><small>Showing ${feedbackRows.length} recent response${feedbackRows.length===1?'':'s'}</small></div>`:''}${feedbackRows.length?`<div class="public-feedback-list">${feedbackRows.map(r=>`<article><b>${escapeHtml(r.display_name||'Anonymous')} · ${'★'.repeat(Number(r.rating||0))}</b><p>${escapeHtml(r.feedback||'')}</p></article>`).join('')}</div>`:''}${suggestionRows.length?`<div class="public-feedback-list"><b>Recent suggestions</b>${suggestionRows.map(r=>`<article><b>${escapeHtml(r.display_name||'Anonymous')}</b><p>${escapeHtml(r.suggestion||'')}</p></article>`).join('')}</div>`:''}</div>
        </div>
        ${canManage()?`<div class="modal-footer"><button class="danger-button" onclick="deleteEvent('${event.id}')">Delete Event</button><div class="modal-footer-right">${canComplete?`<button class="primary-button" onclick="openCompleteEventModal('${event.id}')">Complete Event</button>`:`${isEventCompleted(event)?`<span class="ops-pill">Completed</span>`:''}`}<button class="secondary-button" onclick="openEditEvent('${event.id}')">Edit Event</button><button class="primary-button" onclick="closeModal()">Done</button></div></div>`:`<div class="modal-footer"><button class="primary-button" onclick="closeModal()">Close</button></div>`}
    </div>`);
}

function openCompleteEventModal(eventId){
    if(!canManage()) return;
    const event=events.find(e=>e.id===eventId);
    if(!event || event.is_meeting || isEventCompleted(event)) return;
    showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">Event completion</span><h2>Complete ${escapeHtml(event.title)}</h2><small>Record attendance and the winner before confirming.</small></div><button class="modal-close" onclick="closeModal()">×</button></div><form class="ops-form" id="completeEventForm"><label>How many people showed up?<input name="attendance_count" type="number" min="0" max="100000" required></label><label>Winner name<input name="winner_name" maxlength="120" placeholder="Winner name" required></label><label>Completion notes<textarea name="completion_notes" rows="4" maxlength="1000" placeholder="Optional notes"></textarea></label><button class="primary-button">Confirm Completed Event</button></form></div>`);
    document.getElementById('completeEventForm')?.addEventListener('submit',e=>completeEvent(e,eventId));
}

async function completeEvent(e,eventId){
    e.preventDefault(); if(!canManage()) return;
    const data=Object.fromEntries(new FormData(e.target).entries());
    const attendance=Math.max(0,Number(data.attendance_count)||0);
    const {error}=await supabaseClient.from('events').update({status:'completed',attendance_count:attendance,winner_name:String(data.winner_name||'').trim()||null,completion_notes:String(data.completion_notes||'').trim()||null,completed_at:new Date().toISOString(),completed_by:currentUser?.id||null,updated_by:currentUser?.id||null}).eq('id',eventId);
    if(error) return alert(error.message);
    await writeAudit('event.completed',{event_id:eventId,attendance_count:attendance,winner_name:String(data.winner_name||'').trim()});
    closeModal(); await loadEvents(); await loadInteractionData(); render();
}

/* =========================================================
   EDIT EVENT
/* =========================================================
   EDIT EVENT
   ========================================================= */

function openEditEvent(eventId) {

    const event =
        events.find(item => item.id === eventId);

    if (!event || !canManage()) return;
    if (event.is_meeting && !isAdmin()) {
        alert("Only Managers and Directors can edit staff meetings.");
        return;
    }


    showModal(`
        <div class="modal">

            <div class="modal-header">

                <div>
                    <span class="modal-eyebrow">
                        Edit Event
                    </span>

                    <h2>
                        ${escapeHtml(event.title)}
                    </h2>
                </div>

                <button
                    class="modal-close"
                    onclick="closeModal()">
                    ×
                </button>

            </div>


            <form onsubmit="updateEvent(event, '${event.id}')">

                <div class="form-grid">

                    <div class="form-field full">
                        <label>Event title</label>

                        <input
                            id="editEventTitle"
                            required
                            value="${escapeAttribute(event.title)}"
                        >
                    </div>


                    <div class="form-field">
                        <label>Event type</label>

                        <select id="editEventType" required>

                            ${eventTypes.map(type => `
                                <option
                                    value="${type.id}"
                                    ${type.id === event.event_type_id
                                        ? "selected"
                                        : ""}
                                >
                                    ${escapeHtml(type.name)}
                                </option>
                            `).join("")}

                        </select>
                    </div>


                    <div class="form-field">
                        <label>Date</label>

                        <input
                            id="editEventDate"
                            type="date"
                            value="${event.event_date}"
                            required
                        >
                    </div>


                    <div class="form-field">
                        <label>Start time</label>

                        <input
                            id="editEventStart"
                            type="time"
                            value="${event.start_time.slice(0,5)}"
                            required
                        >
                    </div>


                    <div class="form-field">
                        <label>End time</label>

                        <input
                            id="editEventEnd"
                            type="time"
                            value="${event.end_time.slice(0,5)}"
                            required
                        >
                    </div>


                    <div class="form-field full">
                        <label>Location</label>

                        <input
                            id="editEventLocation"
                            value="${escapeAttribute(
                                event.location || ""
                            )}"
                        >
                    </div>


                    <div class="form-field">
                        <label>Staff required</label>

                        <input
                            id="editEventStaffRequired"
                            type="number"
                            min="0"
                            value="${event.staff_required || 0}"
                        >
                    </div>


                    <div class="form-field">
                        <label>Visibility</label>
                        <select id="editEventVisibility" ${event.is_meeting ? "disabled" : ""}>
                            <option value="public" ${(event.visibility || "public") === "public" ? "selected" : ""}>Player visible</option>
                            <option value="staff" ${event.visibility === "staff" ? "selected" : ""}>Staff only</option>
                        </select>${event.is_meeting ? '<small>Staff meetings are always staff-only.</small>' : ''}
                    </div>

                    <div class="form-field full">
                        <label>Description</label>

                        <textarea
                            id="editEventDescription"
                            rows="5"
                        >${escapeHtml(
                            event.description || ""
                        )}</textarea>
                    </div>

                </div>


                <div id="editEventFormError"
                    class="form-error">
                </div>


                <div class="modal-footer">

                    <button
                        type="button"
                        class="secondary-button"
                        onclick="openEvent('${event.id}')">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="primary-button">
                        Save Changes
                    </button>

                </div>

            </form>

        </div>
    `);
}


async function updateEvent(formEvent, eventId) {

    formEvent.preventDefault();


    const errorBox =
        document.getElementById("editEventFormError");

    errorBox.textContent = "";
    const event = events.find(item => item.id === eventId);
    if (!event) {
        errorBox.textContent = "Event could not be found.";
        return;
    }


    const title =
        document.getElementById("editEventTitle")
            .value.trim();

    const eventTypeId =
        document.getElementById("editEventType").value;

    const eventDate =
        document.getElementById("editEventDate").value;

    const startTime =
        document.getElementById("editEventStart").value;

    const endTime =
        document.getElementById("editEventEnd").value;

    const location =
        document.getElementById("editEventLocation")
            .value.trim();

    const staffRequired =
        parseInt(
            document.getElementById(
                "editEventStaffRequired"
            ).value
        ) || 0;

    const description =
        document.getElementById(
            "editEventDescription"
        ).value.trim();
    let visibility = document.getElementById("editEventVisibility")?.value || "public";
    const editingMeeting = Boolean(event && event.is_meeting);
    if (editingMeeting && !isAdmin()) {
        errorBox.textContent = "Only Managers and Directors can edit staff meetings.";
        return;
    }
    if (editingMeeting) visibility = "staff";


    if (endTime <= startTime) {

        errorBox.textContent =
            "End time must be later than start time.";

        return;
    }


    const { error } = await supabaseClient
        .from("events")
        .update({
            title,
            event_type_id: eventTypeId,
            event_date: eventDate,
            start_time: startTime,
            end_time: endTime,
            location: location || null,
            description: description || null,
            staff_required: staffRequired,
            visibility,
            updated_by: currentUser?.id || null
        })
        .eq("id", eventId);


    if (error) {

        errorBox.textContent = error.message;

        return;
    }


    await writeAudit("event.updated", { event_id: eventId, title, visibility });
    closeModal();

    await loadEvents();

    render();
}


/* =========================================================
   DELETE EVENT
   ========================================================= */

async function markEventComplete(eventId) { openCompleteEventModal(eventId); }

async function deleteEvent(eventId) {

    if (!canManage()) return;


    const event =
        events.find(item => item.id === eventId);

    if (!event) return;
    if (event.is_meeting && !isAdmin()) {
        alert("Only Managers and Directors can delete staff meetings.");
        return;
    }


    const confirmed =
        confirm(
            `Delete "${event.title}"?\n\nThis cannot be undone.`
        );


    if (!confirmed) return;


    const { error } =
        await supabaseClient
            .from("events")
            .delete()
            .eq("id", eventId);


    if (error) {

        alert(error.message);

        return;
    }


    await writeAudit("event.deleted", { event_id: eventId, title: event.title });
    closeModal();

    await loadEvents();

    render();
}


/* =========================================================
   STAFF ALLOCATION
   ========================================================= */

function openStaffAllocation(eventId) {

    const event =
        events.find(item => item.id === eventId);

    if (!event || !canManage()) return;


    const allocatedIds =
        new Set(
            (event.event_staff || [])
                .map(item => item.staff_id)
        );


    showModal(`
        <div class="modal">

            <div class="modal-header">

                <div>
                    <span class="modal-eyebrow">
                        Staff Allocation
                    </span>

                    <h2>
                        ${escapeHtml(event.title)}
                    </h2>
                </div>

                <button
                    class="modal-close"
                    onclick="openEvent('${event.id}')">
                    ×
                </button>

            </div>


            <div class="staff-allocation-summary">

                <strong>
                    ${allocatedIds.size}
                    /
                    ${event.staff_required}
                    staff allocated
                </strong>

                <span>
                    Select the staff members attending this event.
                </span>

            </div>


            <div class="staff-list">

                ${
                    staff.length
                        ? staff.map(member => `
                            <label class="staff-option">

                                <input
                                    type="checkbox"
                                    value="${member.id}"
                                    ${allocatedIds.has(member.id)
                                        ? "checked"
                                        : ""}
                                >

                                <span class="staff-option-name">
                                    ${escapeHtml(member.name)}
                                </span>

                                ${
                                    member.discord_id
                                        ? `<small>
                                            ${escapeHtml(
                                                member.discord_id
                                            )}
                                           </small>`
                                        : ""
                                }

                            </label>
                        `).join("")
                        : `
                            <div class="no-staff">
                                No active staff members exist yet.
                            </div>
                        `
                }

            </div>


            <div id="staffAllocationError"
                class="form-error">
            </div>


            <div class="modal-footer">

                <button
                    class="secondary-button"
                    onclick="openEvent('${event.id}')">
                    Cancel
                </button>

                <button
                    class="primary-button"
                    onclick="saveStaffAllocation('${event.id}')">
                    Save Allocation
                </button>

            </div>

        </div>
    `);
}


async function saveStaffAllocation(eventId) {

    if (!canManage()) return;


    const event =
        events.find(item => item.id === eventId);

    if (!event) return;


    const checked =
        [...document.querySelectorAll(
            '.staff-option input:checked'
        )].map(input => input.value);


    const errorBox =
        document.getElementById(
            "staffAllocationError"
        );


    if (
        event.staff_required > 0 &&
        checked.length > event.staff_required
    ) {

        errorBox.textContent =
            `You can only allocate ${event.staff_required} staff members.`;

        return;
    }


    const existing =
        event.event_staff || [];


    const existingIds =
        existing.map(item => item.staff_id);


    const toRemove =
        existing.filter(item =>
            !checked.includes(item.staff_id)
        );


    const toAdd =
        checked.filter(id =>
            !existingIds.includes(id)
        );


    if (toRemove.length) {

        const ids =
            toRemove.map(item => item.id);


        const { error } =
            await supabaseClient
                .from("event_staff")
                .delete()
                .in("id", ids);


        if (error) {

            errorBox.textContent = error.message;

            return;
        }
    }


    if (toAdd.length) {

        const rows =
            toAdd.map(staffId => ({
                event_id: eventId,
                staff_id: staffId,
                role: "Staff",
                allocated_by: currentUser?.id || null
            }));


        const { error } =
            await supabaseClient
                .from("event_staff")
                .insert(rows);


        if (error) {

            errorBox.textContent = error.message;

            return;
        }
    }


    await loadEvents();

    openEvent(eventId);
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setView(view) {

    currentView = view;

    render();
}


function goToday() {

    currentDate = new Date();

    render();
}


function previousPeriod() {

    if (currentView === "month") {
        currentDate.setMonth(
            currentDate.getMonth() - 1
        );
    }

    else if (
        currentView === "week"
    ) {
        currentDate.setDate(
            currentDate.getDate() - 7
        );
    }

    else {
        currentDate.setDate(
            currentDate.getDate() - 1
        );
    }


    render();
}


function nextPeriod() {

    if (currentView === "month") {
        currentDate.setMonth(
            currentDate.getMonth() + 1
        );
    }

    else if (
        currentView === "week"
    ) {
        currentDate.setDate(
            currentDate.getDate() + 7
        );
    }

    else {
        currentDate.setDate(
            currentDate.getDate() + 1
        );
    }


    render();
}


function handleDateClick(date, hour = null) {

    // Clicking a date from the month view opens that date in the
    // detailed hour-by-hour Day view. Clicking an hour from the
    // day/week view can create an event when Management is signed in.

    if (hour === null) {

        currentDate = new Date(`${date}T12:00:00`);

        currentView = "day";

        render();

        return;
    }


    if (!canManage()) return;


    currentDate = new Date(`${date}T12:00:00`);

    openCreateEventModal(date, hour);
}


/* =========================================================
   MODALS
   ========================================================= */

function showModal(content) {

    const container =
        document.getElementById("modalContainer");

    if (!container) return;

    container.innerHTML = `
        <div
            class="modal-backdrop"
            onclick="handleModalBackdrop(event)"
        >
            ${content}
        </div>
    `;

    document.body.classList.add("modal-open");
}


function handleModalBackdrop(event) {

    if (
        event.target.classList.contains(
            "modal-backdrop"
        )
    ) {
        closeModal();
    }
}


function closeModal() {

    const container =
        document.getElementById("modalContainer");

    if (container) {
        container.innerHTML = "";
    }

    document.body.classList.remove("modal-open");

    selectedEvent = null;
}


function showLoginMessage() {

    showModal(`
        <div class="modal small-modal">

            <div class="modal-header">

                <div>
                    <span class="modal-eyebrow">
                        Management Access
                    </span>

                    <h2>Sign in required</h2>
                </div>

                <button
                    class="modal-close"
                    onclick="closeModal()">
                    ×
                </button>

            </div>

            <p class="modal-message">
                Public players can view player-facing events. Staff-only events and Entertainment tools require staff access.
            </p>

            <div class="modal-footer">

                <button
                    class="primary-button"
                    onclick="openLogin()">
                    Discord Login
                </button>

            </div>

        </div>
    `);
}


/* =========================================================
   LOGIN
   ========================================================= */

function openLogin() {
    showModal(`
        <div class="modal small-modal discord-login-modal">
            <div class="modal-header">
                <div>
                    <span class="modal-eyebrow">KNG Entertainment</span>
                    <h2>Discord Login</h2>
                </div>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>

            <p class="modal-message">Sign in with Discord to identify your account. Login alone gives you no KNG permissions. Access is granted through a security chain: ADM confirms Members, Manager confirms Members and ADMs, and Director confirms Members, ADMs and Managers.</p>

            <button class="discord-login-button" onclick="loginWithDiscord()">
                <span class="discord-icon">◈</span>
                Continue with Discord
            </button>

            <div id="loginError" class="form-error"></div>
        </div>
    `);
}

async function loginWithDiscord() {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
        const errorBox = document.getElementById("loginError");
        if (errorBox) errorBox.textContent = error.message;
    }
}


async function logout() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Logout failed:", error);
        return;
    }

    currentUser = null;
    currentAccess = null;

    render();
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function formatDate(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;
}


function formatDisplayDate(dateString) {

    const date =
        new Date(`${dateString}T00:00:00`);


    return date.toLocaleDateString(
        "en-GB",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}


function formatShortDate(date) {

    return date.toLocaleDateString(
        "en-GB",
        {
            day: "numeric",
            month: "short"
        }
    );
}


function formatTime(time) {

    if (!time) return "";

    const [hour, minute] =
        time.split(":");


    const date =
        new Date();

    date.setHours(
        parseInt(hour),
        parseInt(minute),
        0,
        0
    );


    return date.toLocaleTimeString(
        "en-GB",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}


function startOfWeek(date) {

    const result =
        new Date(date);

    const day =
        result.getDay();

    const difference =
        day === 0
            ? -6
            : 1 - day;


    result.setDate(
        result.getDate() + difference
    );


    result.setHours(0, 0, 0, 0);

    return result;
}


function isToday(date) {

    const today =
        new Date();

    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}


/* =========================================================
   SECURITY / HTML HELPERS
   ========================================================= */

function escapeHtml(value) {

    if (value === null || value === undefined) {
        return "";
    }


    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {

    return escapeHtml(value);
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.setView = setView;
window.goToday = goToday;
window.previousPeriod = previousPeriod;
window.nextPeriod = nextPeriod;

window.handleDateClick = handleDateClick;

window.openCreateEventModal =
    openCreateEventModal;
window.openCreateMeetingModal = openCreateMeetingModal;
window.createMeeting = createMeeting;
window.markEventComplete = markEventComplete;
window.openCompleteEventModal = openCompleteEventModal;
window.completeEvent = completeEvent;

window.createEvent = createEvent;

window.openEvent = openEvent;

window.openEditEvent =
    openEditEvent;

window.updateEvent =
    updateEvent;

window.deleteEvent =
    deleteEvent;

window.openStaffAllocation =
    openStaffAllocation;

window.saveStaffAllocation =
    saveStaffAllocation;

window.closeModal =
    closeModal;

window.handleModalBackdrop =
    handleModalBackdrop;

window.openLogin =
    openLogin;




/* =========================================================
   INTEGRATED KNG OPERATIONS
   Rebuilds the useful client-side behaviour discovered in the
   public Interactions frontend, using this Schedule's Supabase
   backend instead of the original site's private endpoints.
   ========================================================= */

function operationsNavHtml() {
    const pendingCount = accessRequests.filter(r => r.status === "pending").length;
    const items = [
        // Public / community
        ["schedule", "▦", "Schedule", 0],
        ["command-dashboard", "⌂", "Command Dashboard", 1],
        ["event-suggestions", "✦", "Event Suggestions", 0],
        ["interactions-leaderboard", "♛", "Leaderboard", 1],
        ["hall-of-fame", "▣", "Hall of Fame", 1],
        // Staff tools
        ["daily-goals", "◎", "Daily Goals", 1],
        ["staff-roster", "♙", "Staff Roster", 2],
        ["hungry", "🎲", "Host an Event", 1],
        // Operations
        ["dashboard", "◈", "Operations Dashboard", 2],
        ["actions", "⚡", "Actions & Interactions", 2],
        ["points", "✣", "Points", 2],
        ["prizes", "◇", "Prizes & Commands", 2],
        ["security", "◉", "Security", 3]
    ];
    if (canApproveAccess()) items.push(["access", "✓", `Access Requests${pendingCount ? ` (${pendingCount})` : ""}`, 2]);
    const rank = permissionRank();
    const visible = items.filter(([, , , requiredRank]) => rank >= requiredRank);
    return `<aside class="integrated-sidebar" aria-label="KNG navigation">
        <div class="sidebar-section-label">KNG ENTERTAINMENT</div>
        <nav class="integrated-sidebar-nav">
            ${visible.map(([id, icon, label]) => `
                <button class="integrated-nav-btn ${(opsView === id || ixView === id) ? "active" : ""}" onclick="switchOpsView('${id}')">
                    <span class="nav-icon">${icon}</span><span>${label}</span>
                </button>`).join("")}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-access-card">
            <span class="sidebar-access-label">CURRENT ACCESS</span>
            <strong>${escapeHtml(String(getPermissionLevel()).toUpperCase())}</strong>
            ${currentUser ? `<small>${escapeHtml(currentUser.email || "Discord account")}</small>` : `<small>Public visitor</small>`}
        </div>
    </aside>`;
}

function opsHeader(title="KNG Schedule", subtitle="Events & Staff Planning") {
    return `<header class="schedule-header ops-header">
        <div class="schedule-brand">
            <div class="schedule-logo crown-logo">♛</div>
            <div><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div>
        </div>
        <div class="schedule-header-actions">
            ${canManage()
                ? `<span class="mode-badge staff-mode">STAFF MODE</span><button class="header-button" onclick="logout()">Logout</button>`
                : `<span class="mode-badge player-mode">PLAYER VIEW</span><button class="header-button" onclick="openLogin()">Discord Login</button>`}
        </div>
    </header>`;
}

async function switchOpsView(view) {
    const publicViews = ["event-suggestions"];
    const ixViews = ["command-dashboard", "interactions-leaderboard", "hall-of-fame", "daily-goals", "staff-roster", "event-suggestions"];
    if (view !== "schedule" && !currentUser && !publicViews.includes(view)) {
        showLoginMessage();
        return;
    }
    if (view === "access" && !canApproveAccess()) {
        showLoginMessage();
        return;
    }
    if (ixViews.includes(view)) {
        ixView = view;
        opsView = "schedule";
        try { localStorage.setItem("kng.ixView", view); localStorage.setItem("kng.opsView", "schedule"); } catch (_) {}
        if (view === "staff-roster") await loadRosterData();
        await loadInteractionData();
        render();
        return;
    }
    opsView = view;
    ixView = "";
    if (view === "schedule") { try { localStorage.removeItem("kng.ixView"); } catch (_) {} }
    try { localStorage.setItem("kng.opsView", view); } catch (_) {}
    if (view !== "schedule") await loadOpsData();
    render();
}

async function loadOpsTable(name, queryFn) {
    try {
        const result = await queryFn();
        if (result.error) throw result.error;
        opsLoadErrors[name] = null;
        return result.data || [];
    } catch (error) {
        opsLoadErrors[name] = error?.message || String(error);
        return [];
    }
}

async function loadOpsData() {
    if (!currentUser) return;
    const [tracker, points, hungry, reductions, audit, security, prizes, helpers, prizeWins, timeouts, blocks] = await Promise.all([
        loadOpsTable("tracker", () => supabaseClient.from("ops_tracker").select("*, staff(id,name,discord_id)").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("points", () => supabaseClient.from("ops_points").select("*, staff(id,name,discord_id)").order("created_at", { ascending: false }).limit(1000)),
        loadOpsTable("hungry", () => supabaseClient.from("ops_hungry").select("*").order("event_date").order("event_time")),
        loadOpsTable("reductions", () => supabaseClient.from("ops_reductions").select("*, staff(id,name,discord_id)").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("audit", () => supabaseClient.from("ops_audit").select("*").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("security", () => supabaseClient.from("ops_security").select("*").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("prizes", () => supabaseClient.from("ops_prizes").select("*").eq("active", true).order("amount")),
        loadOpsTable("helpers", () => supabaseClient.from("ops_helpers").select("*, staff(id,name,discord_id), events(id,title,event_date,start_time)").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("prizeWins", () => supabaseClient.from("ops_prize_wins").select("*, ops_prizes(label,code,command_template)").order("created_at", { ascending: false }).limit(250)),
        loadOpsTable("timeouts", () => supabaseClient.from("ops_timeouts").select("*").order("expires_at", { ascending: false }).limit(250)),
        loadOpsTable("blocks", () => supabaseClient.from("ops_access_blocks").select("*").eq("active", true).order("created_at", { ascending: false }).limit(250))
    ]);
    ops = { tracker, points, hungry, reductions, audit, security, prizes, helpers, prizeWins, timeouts, blocks };
    const settingsResult = await loadOpsTable("security_settings", () => supabaseClient.from("ops_security_settings").select("*").eq("id", 1).maybeSingle());
    crashoutSettings = { max_removals: Number(settingsResult?.max_removals || 3), window_minutes: Number(settingsResult?.window_minutes || 60), timeout_minutes: Number(settingsResult?.timeout_minutes || 30) };
}

function opsCard(title, body, extra="") {
    return `<section class="ops-card"><div class="ops-card-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
}

function opsErrorNotice(name) {
    const err = opsLoadErrors[name];
    if (!err) return "";
    return `<div class="ops-notice warning">${escapeHtml(name)} is not connected yet. Run <code>KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql</code> in Supabase. <small>${escapeHtml(err)}</small></div>`;
}

function ixSchemaNotice(name) {
    const err = opsLoadErrors[name];
    if (!err) return "";
    return `<div class="ops-notice warning">${escapeHtml(name)} is not set up yet. Run <code>KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql</code> in Supabase. <small>${escapeHtml(err)}</small></div>`;
}

function renderOperations() {
    const ixViews = ["command-dashboard","interactions-leaderboard","hall-of-fame","daily-goals","staff-roster","event-suggestions"];
    if (ixViews.includes(ixView)) { renderInteractionView(); return; }
    if (opsView === "schedule") { render(); return; }
    if (opsView === "access" && !canApproveAccess()) { showLoginMessage(); return; }
    const titles = {
        dashboard: ["KNG Entertainment Dashboard", "Events, completions and staff operations"],
        "command-dashboard": ["Command Dashboard", "KNG Interactions + Entertainment command centre"],
        "interactions-leaderboard": ["Leaderboard", "Staff activity, events and points"],
        "hall-of-fame": ["Hall of Fame", "Winner frames and event recognition"],
        "daily-goals": ["Daily Goals", "Track your interaction target"],
        "staff-roster": ["Staff Roster", "Current KNG Entertainment staff"],
        actions: ["Actions & Interactions", "Tracker, hungry pool, reductions and helpers"],
        tracker: ["Tracker", "Track staff activity and operational work"],
        points: ["Points", "Staff points, adjustments and leaderboard"],
        hungry: ["Host an Event", "Randomise, plan and manually edit the entertainment schedule"],
        reductions: ["Reductions", "Track staff reductions and reasons"],
        security: ["Security", "Security events and audit visibility"],
        prizes: ["Prizes & Commands", "Prize wins and ready-to-copy commands"],
        helpers: ["Helpers", "Assign additional staff helpers to events"],
        access: ["Access Requests", "Confirm Discord accounts and grant staff permissions"]
    };
    const [title, subtitle] = titles[opsView] || titles.dashboard;
    app.innerHTML = `<div class="schedule-app operations-app">
        ${opsHeader(title, subtitle)}
        <div class="app-body operations-body">
            ${operationsNavHtml()}
            <main class="operations-main">
                <div class="operations-content">${renderOpsViewHtml()}</div>
            </main>
        </div>
        <div id="modalContainer"></div>
    </div>`;
    bindOpsHandlers();
}

function renderOpsViewHtml() {
    switch (opsView) {
        case "dashboard": return renderOpsDashboard();
        case "command-dashboard": return renderInteractionDashboard();
        case "interactions-leaderboard": return renderInteractionLeaderboard();
        case "hall-of-fame": return renderHallOfFame();
        case "daily-goals": return renderDailyGoals();
        case "staff-roster": return renderStaffRoster();
        case "event-suggestions": return renderEventSuggestions();
        case "actions": return renderOpsActionsHub();
        case "tracker": return renderOpsTracker();
        case "points": return renderOpsPoints();
        case "hungry": return renderHostEventPlanner();
        case "reductions": return renderOpsReductions();
        case "logs": return renderOpsLogs();
        case "security": return renderOpsSecurity();
        case "prizes": return renderOpsPrizes();
        case "helpers": return renderOpsHelpers();
        case "access": return renderOpsAccess();
        default: return `<div class="ops-card"><h3>Schedule</h3><p>Use the Schedule tab.</p></div>`;
    }
}

function renderOpsDashboard() {
    const today = formatDate(new Date());
    const todayEvents = events.filter(e => e.event_date === today && !e.is_meeting);
    const completed = (allEvents || []).filter(e => !e.is_meeting && isEventCompleted(e));
    const counts = {};
    completed.forEach(e => {
        const key = e.title || e.event_types?.name || "Event";
        counts[key] = (counts[key] || 0) + 1;
    });
    const leaderboard = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const totalPoints = ops.points.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const activeReductions = ops.reductions.filter(r => r.active !== false).length;
    return `${opsErrorNotice("tracker")}${opsErrorNotice("points")}
        <div class="ops-stats-grid">
            <div class="ops-stat"><span>Today</span><strong>${todayEvents.length}</strong><small>scheduled events</small></div>
            <div class="ops-stat"><span>Completed</span><strong>${completed.length}</strong><small>completed events</small></div>
            <div class="ops-stat"><span>Staff</span><strong>${staff.length}</strong><small>active staff</small></div>
            <div class="ops-stat"><span>Points</span><strong>${totalPoints}</strong><small>recorded adjustments</small></div>
            <div class="ops-stat"><span>Hungry</span><strong>${ops.hungry.length}</strong><small>open entries</small></div>
            <div class="ops-stat"><span>Reductions</span><strong>${activeReductions}</strong><small>active records</small></div>
        </div>
        <div class="ops-grid-two">
            ${opsCard("Today's schedule", todayEvents.length ? `<div class="ops-list">${todayEvents.slice(0,8).map(e => `<div class="ops-row"><div><b>${escapeHtml(e.title)}</b><small>${formatTime(e.start_time)} - ${formatTime(e.end_time)}</small></div><span class="ops-pill">${escapeHtml(e.event_types?.name || "Event")}</span></div>`).join("")}</div>` : `<div class="ops-empty">Nothing scheduled today.</div>`)}
            ${opsCard("Completed event leaderboard", leaderboard.length ? `<div class="ops-list leaderboard-list">${leaderboard.map(([name,count],i)=>`<div class="ops-row"><div><b>#${i+1} · ${escapeHtml(name)}</b><small>Completed ${count} time${count===1?"":"s"}</small></div><span class="ops-pill">${count}</span></div>`).join("")}</div>` : `<div class="ops-empty">No completed events yet. Humanity survives another day.</div>`)}
        </div>`;
}

function renderOpsActionsHub() {
    return `<div class="ops-grid-two">
        ${opsCard("Actions", `<div class="action-hub-grid">
            <button class="hub-action" onclick="switchOpsView('tracker')"><b>Tracker</b><small>Staff activity and operational work</small></button>
            <button class="hub-action" onclick="switchOpsView('hungry')"><b>Host an Event</b><small>Randomise, plan and manually edit event slots</small></button>
            <button class="hub-action" onclick="switchOpsView('reductions')"><b>Reductions</b><small>Record staff reductions</small></button>
            <button class="hub-action" onclick="switchOpsView('helpers')"><b>Helpers</b><small>Assign event helpers</small></button>
        </div>`)}
        ${opsCard("Quick actions", `<div class="action-hub-grid">
            <button class="hub-action" onclick="openCreateEventModal()"><b>Create Event</b><small>Party, Event, Battle Royale or Community Meeting</small></button>
            <button class="hub-action" onclick="openPrizeWinModal()"><b>Prize Win</b><small>Record a winner and generate their command</small></button>
            <button class="hub-action" onclick="switchOpsView('security')"><b>Security</b><small>Timeout or kick off multiple users</small></button>
        </div>`)}
    </div>`;
}

function renderOpsTracker() {
    const teams = [...new Set(ops.tracker.map(x => x.team).filter(Boolean))].sort();
    return `${opsErrorNotice("tracker")}
        <div class="ops-toolbar"><select id="trackerTeamFilter"><option value="all">All teams</option>${teams.map(t=>`<option value="${escapeAttribute(t)}">${escapeHtml(t)}</option>`).join("")}</select><button class="primary-button" id="openTrackerAdd">+ Add activity</button></div>
        ${opsCard("Activity tracker", ops.tracker.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Staff</th><th>Team</th><th>Type</th><th>Status</th><th>When</th></tr></thead><tbody>${ops.tracker.map(x=>`<tr data-team-row="${escapeAttribute(x.team || "")}"><td>${escapeHtml(x.staff?.name || "Unknown")}</td><td>${escapeHtml(x.team || "")}</td><td>${escapeHtml(x.activity_type || "Activity")}</td><td><span class="ops-pill">${escapeHtml(x.status || "Logged")}</span></td><td>${formatOpsDateTime(x.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ops-empty">No tracker entries yet.</div>`)}
    `;
}

function renderOpsPoints() {
    const totals = {};
    ops.points.forEach(p => { const id=p.staff_id; if(!totals[id]) totals[id]={name:p.staff?.name||"Unknown", total:0}; totals[id].total += Number(p.amount||0); });
    const rows = Object.values(totals).sort((a,b)=>b.total-a.total);
    return `${opsErrorNotice("points")}
        <div class="ops-grid-two">
            ${opsCard("Leaderboard", rows.length ? `<div class="leaderboard">${rows.map((r,i)=>`<div class="leader-row"><span class="rank">${i+1}</span><b>${escapeHtml(r.name)}</b><strong>${r.total}</strong></div>`).join("")}</div>` : `<div class="ops-empty">No points recorded yet.</div>`)}
            ${canManage() ? opsCard("Adjust points", `<form id="pointsForm" class="ops-form"><select name="staff_id" required><option value="">Select staff</option>${staff.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select><input name="amount" type="number" min="-25" max="25" required placeholder="Points (-25 to 25)"><input name="reason" maxlength="200" required placeholder="Reason"><button class="primary-button">Apply adjustment</button><small>Maximum adjustment: 25 points.</small></form>`) : `<div class="ops-card"><h3>Adjust points</h3><div class="ops-empty">Management access required.</div></div>`}
        </div>`;
}

function hostEventPool() {
    return [
        "Arena Annihilation","Bar Fight","BMX Sprint","Boxes","Breaks Are Gone","Buggy Blitz","Bumper Cars","Cargo FFA","Compound FFA","Cops & Robbers","Crossy Road","Dead Man's Dash","Dirty Derby","Dress to Impress","Factory of Fear","Family Fortunes","Find the Animal","Football Trivia","Fortune's Choice","Grand Prix","Guess the Song","Got-A-Reason","Go-Kart Race","Hide My Ride","Higher or Lower","Hide-or-Die Chicken Coop","Hide-or-Die Chinatown","Hide-or-Die Hospital","Hide-or-Die University","KNG Got Talent","KNG Trivia","Long Haul Championship","Monster Truck Gauntlet","Musical Cars","Musical Statues","Need for Speed","Phantoms vs Runners","Pop Quiz","Ramps","Rubber Dinghy Rapids","Sandy Seeking","Scavenger Hunt","Simon Says","Slippy Slide","Subway Surfers","Taxi Dash","Harbour Havoc","Would You Rather","Word War","Clown Survival","Deadman's Pit","Ghost Rider Rally","Haunted Hospital","Headless Horseman","Infected","Scrapyard Showdown","The Haunting Grounds","The Slasher","Chemist Clash","KNG Boxing"
    ];
}
function hostManualOnlyEvents() { return ["Club 77", "Vanilla"]; }
function hostAllEventChoices() { return [...hostEventPool(), ...hostManualOnlyEvents()]; }
function hostTimeToMinutes(value) { const [h,m] = String(value || "00:00").split(":").map(Number); return (h * 60) + m; }
function hostMinutesToTime(minutes) { const h = Math.floor(minutes / 60) % 24; const m = minutes % 60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function hostSlotOccupied(date, start, end, ignoreId = null) {
    const s = hostTimeToMinutes(start), e = hostTimeToMinutes(end);
    return (allEvents || []).some(ev => { if (ignoreId && String(ev.id) === String(ignoreId)) return false; if (ev.event_date !== date || ev.status === "cancelled") return false; const es=hostTimeToMinutes(ev.start_time), ee=hostTimeToMinutes(ev.end_time); return es < e && ee > s; });
}
function hostTypeIdFor(title) {
    const lower = String(title || "").toLowerCase();
    if (lower === "club 77" || lower === "vanilla") return eventTypes.find(t => String(t.name||"").toLowerCase() === "party")?.id || eventTypes.find(t => String(t.name||"").toLowerCase() === "event")?.id;
    return eventTypes.find(t => String(t.name||"").toLowerCase() === "event")?.id || eventTypes[0]?.id;
}
function renderHostEventPlanner() {
    const date = hostPlannerDate || formatDate(new Date());
    const todayEvents = (allEvents || []).filter(e => e.event_date === date && e.status !== "cancelled").sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));
    const canEdit = canManage();
    return `${opsErrorNotice("hungry")}
        <div class="host-event-toolbar"><div><span class="host-eyebrow">KNG ENTERTAINMENT</span><h2>Host an Event</h2><p>Build the schedule, protect planned slots, then change anything manually when the schedule inevitably develops opinions.</p></div>${canEdit ? `<div class="host-toolbar-buttons"><button class="primary-button" onclick="randomiseHostSchedule()">🎲 Randomise Empty Slots</button><button class="secondary-button" onclick="toggleHostPanel('plannedHostPanel')">📅 Add Planned Event</button><button class="secondary-button" onclick="toggleHostPanel('manualHostPanel')">➕ Add Event</button></div>` : ""}</div>
        <div id="plannedHostPanel" class="host-control-panel" hidden><div class="host-control-head"><div><b>Planned / Protected Event</b><small>Daily, weekly or biweekly events lock their slots so the randomiser cannot fill them.</small></div><button class="secondary-button small" onclick="toggleHostPanel('plannedHostPanel')">Close</button></div><form id="plannedHostForm" class="host-form-grid"><input name="title" maxlength="120" placeholder="Event name" required><select name="type_id" required>${eventTypes.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}</select><input name="event_date" type="date" value="${date}" required><input name="start_time" type="time" value="18:00" required><input name="end_time" type="time" value="18:30" required><select name="repeat"><option value="none">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option></select><input name="repeat_until" type="date" value="${formatDate(new Date(Date.now()+90*86400000))}" required><input name="description" maxlength="500" placeholder="Optional note"><button class="primary-button" type="submit">Create &amp; Protect Slot(s)</button></form><div id="plannedHostError" class="form-error"></div></div>
        <div id="manualHostPanel" class="host-control-panel" hidden><div class="host-control-head"><div><b>Manual Event</b><small>Club 77 and Vanilla are available here but are never chosen by the randomiser.</small></div><button class="secondary-button small" onclick="toggleHostPanel('manualHostPanel')">Close</button></div><form id="manualHostForm" class="host-form-grid"><select name="title" required>${hostAllEventChoices().map(x=>`<option value="${escapeAttribute(x)}">${escapeHtml(x)}</option>`).join("")}</select><input name="event_date" type="date" value="${date}" required><input name="start_time" type="time" value="18:00" required><input name="end_time" type="time" value="18:30" required><input name="description" maxlength="500" placeholder="Optional note"><label class="host-check"><input type="checkbox" name="locked"> Protect this slot from the randomiser</label><button class="primary-button" type="submit">Add Event</button></form><div id="manualHostError" class="form-error"></div></div>
        <div class="host-randomiser-card"><div><b>Randomiser</b><small>Only empty slots are filled. Existing events are never overwritten by the randomiser.</small></div><div class="host-randomiser-controls"><label class="host-date-label">View / randomise date<input id="hostRandomDate" type="date" value="${date}" onchange="setHostPlannerDate(this.value)"></label><input id="hostRandomStart" type="time" value="18:00"><input id="hostRandomEnd" type="time" value="23:30"><select id="hostRandomInterval"><option value="30">30 minute slots</option><option value="60">60 minute slots</option></select></div></div>
        <div class="host-schedule-card"><div class="host-section-head"><div><h3>Schedule</h3><small>Every slot can still be edited after randomisation.</small></div><span class="ops-pill">${todayEvents.length} scheduled</span></div><div id="hostScheduleList" class="host-slot-list">${todayEvents.length ? todayEvents.map(e => hostRenderSlot(e)).join("") : `<div class="ops-empty">No events are scheduled for today yet.</div>`}</div></div>
        <div class="host-rules-grid"><div><b>🎲 Random</b><small>${hostEventPool().length} event choices</small></div><div><b>🎉 Manual only</b><small>Club 77 + Vanilla</small></div><div><b>🔒 Protected</b><small>Planned slots cannot be overwritten by the randomiser</small></div><div><b>✏️ Editable</b><small>You can change any slot after randomisation</small></div></div>`;
}
function hostRenderSlot(e) {
    const source = e.host_source === "random" ? "Random" : e.host_source === "planned" ? "Planned / Protected" : "Manual / Existing";
    const locked = e.host_locked || e.host_source === "planned";
    const claimed = Boolean(e.host_claimed_by || e.host_claimed_discord);
    const claimLabel = claimed ? `Claimed by ${e.host_claimed_name ? escapeHtml(e.host_claimed_name) : escapeHtml(e.host_claimed_discord || "Staff")}${e.host_claimed_discord ? ` · ${escapeHtml(e.host_claimed_discord)}` : ""}` : "";
    const claimButton = currentUser && permissionRank() >= 1 && !claimed ? `<button class="primary-button small host-claim-btn" onclick="claimHostSlot('${e.id}')">🎤 Claim</button>` : "";
    return `<div class="host-slot ${locked ? "host-slot-locked" : ""}"><div class="host-slot-time">${escapeHtml(String(e.start_time||"").slice(0,5))}<small>${escapeHtml(String(e.end_time||"").slice(0,5))}</small></div><div class="host-slot-main"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(source)}${e.description ? ` · ${escapeHtml(e.description)}` : ""}${claimLabel ? ` · <span class="host-claimed">${claimLabel}</span>` : ""}</small></div><div class="host-slot-actions">${locked ? `<span class="host-lock">🔒</span>` : ""}${claimButton}${canManage() ? `<button class="secondary-button small" onclick="openHostEdit('${e.id}')">Edit</button>` : ""}</div></div>`;
}

async function claimHostSlot(id) {
    if (!currentUser || permissionRank() < 1) return alert("You must be signed in as KNG staff to claim an event.");
    const { data, error } = await supabaseClient.rpc("claim_event_host_slot", { p_event_id: id });
    if (error) return alert(error.message);
    if (data === false) return alert("That event has already been claimed by another staff member.");
    await loadEvents();
    render();
}

function setHostPlannerDate(value){ if(!value)return; hostPlannerDate=value; try{localStorage.setItem("kng.hostPlannerDate",value);}catch(_){} render(); }
function toggleHostPanel(id) { const el=document.getElementById(id); if(el) el.hidden=!el.hidden; }
async function submitPlannedHostEvent(e){ e.preventDefault(); if(!canManage())return; const d=Object.fromEntries(new FormData(e.target).entries()), err=document.getElementById("plannedHostError"); err.textContent=""; if(d.end_time<=d.start_time)return err.textContent="End time must be later than start time."; if(d.repeat!=="none"&&d.repeat_until<d.event_date)return err.textContent="Repeat until must be on or after the first date."; const dates=buildRecurringDates(d.event_date,d.repeat,d.repeat_until); const blocked=dates.filter(x=>hostSlotOccupied(x,d.start_time,d.end_time)); if(blocked.length)return err.textContent=`These dates already have an event in that slot: ${blocked.join(", ")}`; const group=dates.length>1?crypto.randomUUID():null; const rows=dates.map(x=>({title:d.title.trim(),event_type_id:d.type_id,event_date:x,start_time:d.start_time,end_time:d.end_time,description:d.description?.trim()||null,location:null,staff_required:0,visibility:"public",recurrence_group_id:group,recurrence_rule:d.repeat==="none"?null:d.repeat,status:"scheduled",is_meeting:false,created_by:currentUser.id,updated_by:currentUser.id,host_source:"planned",host_locked:true})); const {error}=await supabaseClient.from("events").insert(rows); if(error)return err.textContent=error.message; await writeAudit("host.planned_created",{title:d.title,dates,repeat:d.repeat}); await loadEvents(); render(); }
async function submitManualHostEvent(e){ e.preventDefault(); if(!canManage())return; const d=Object.fromEntries(new FormData(e.target).entries()), err=document.getElementById("manualHostError"); err.textContent=""; if(d.end_time<=d.start_time)return err.textContent="End time must be later than start time."; if(hostSlotOccupied(d.event_date,d.start_time,d.end_time))return err.textContent="That time slot already has an event. Edit the existing slot instead."; const typeId=hostTypeIdFor(d.title); if(!typeId)return err.textContent="No usable Event type exists in the database."; const payload={title:d.title,event_type_id:typeId,event_date:d.event_date,start_time:d.start_time,end_time:d.end_time,description:d.description?.trim()||null,location:null,staff_required:0,visibility:"public",recurrence_group_id:null,recurrence_rule:null,status:"scheduled",is_meeting:false,created_by:currentUser.id,updated_by:currentUser.id,host_source:"manual",host_locked:d.locked==="on"}; const {error}=await supabaseClient.from("events").insert(payload); if(error)return err.textContent=error.message; await writeAudit("host.manual_created",payload); await loadEvents(); render(); }
async function randomiseHostSchedule(){ if(!canManage())return; const date=document.getElementById("hostRandomDate")?.value,start=document.getElementById("hostRandomStart")?.value||"18:00",end=document.getElementById("hostRandomEnd")?.value||"23:30",interval=Math.max(30,Number(document.getElementById("hostRandomInterval")?.value||30)); if(!date||hostTimeToMinutes(end)<=hostTimeToMinutes(start))return alert("Choose a valid randomiser time range."); const typeId=hostTypeIdFor("Event"); if(!typeId)return alert("No Event type exists in the database."); const choices=hostEventPool(),rows=[]; let previous=""; for(let m=hostTimeToMinutes(start);m+interval<=hostTimeToMinutes(end);m+=interval){const a=hostMinutesToTime(m),b=hostMinutesToTime(m+interval);if(hostSlotOccupied(date,a,b))continue;const available=choices.filter(x=>x!==previous),title=available[Math.floor(Math.random()*available.length)];previous=title;rows.push({title,event_type_id:typeId,event_date:date,start_time:a,end_time:b,description:"Randomised by KNG Entertainment Host an Event",location:null,staff_required:0,visibility:"public",recurrence_group_id:null,recurrence_rule:null,status:"scheduled",is_meeting:false,created_by:currentUser.id,updated_by:currentUser.id,host_source:"random",host_locked:false});} if(!rows.length)return alert("There are no empty slots in that range to randomise."); const {error}=await supabaseClient.from("events").insert(rows); if(error)return alert(error.message); await writeAudit("host.randomised",{date,start,end,interval,created:rows.map(r=>r.title)}); await loadEvents(); render(); }
function openHostEdit(id){ if(!canManage())return; const e=allEvents.find(x=>String(x.id)===String(id)); if(!e)return; const titleOptions=hostAllEventChoices().map(x=>`<option value="${escapeAttribute(x)}" ${x===e.title?"selected":""}>${escapeHtml(x)}</option>`).join(""); showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">Host an Event</span><h2>Edit Event Slot</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form id="hostEditForm" class="ops-form"><label>Event<select name="title">${titleOptions}</select></label><label>Date<input name="event_date" type="date" value="${escapeAttribute(e.event_date)}" required></label><label>Start<input name="start_time" type="time" value="${escapeAttribute(String(e.start_time||"").slice(0,5))}" required></label><label>End<input name="end_time" type="time" value="${escapeAttribute(String(e.end_time||"").slice(0,5))}" required></label><label>Note<input name="description" maxlength="500" value="${escapeAttribute(e.description||"")}" placeholder="Optional note"></label><label class="host-check"><input type="checkbox" name="locked" ${e.host_locked||e.host_source==="planned"?"checked":""}> Protect this slot from randomiser</label><div id="hostEditError" class="form-error"></div><div class="modal-footer"><button type="button" class="secondary-button" onclick="closeModal()">Cancel</button><button type="button" class="danger-button" onclick="deleteHostEvent('${e.id}')">Delete</button><button type="submit" class="primary-button">Save Changes</button></div></form></div>`); document.getElementById("hostEditForm")?.addEventListener("submit",async ev=>{ev.preventDefault();const d=Object.fromEntries(new FormData(ev.target).entries()),err=document.getElementById("hostEditError");err.textContent="";if(d.end_time<=d.start_time)return err.textContent="End time must be later than start time.";if(hostSlotOccupied(d.event_date,d.start_time,d.end_time,e.id))return err.textContent="That new slot overlaps another event.";const typeId=hostTypeIdFor(d.title);const payload={title:d.title,event_type_id:typeId||e.event_type_id,event_date:d.event_date,start_time:d.start_time,end_time:d.end_time,description:d.description?.trim()||null,updated_by:currentUser.id,host_locked:d.locked==="on"};const {error}=await supabaseClient.from("events").update(payload).eq("id",e.id);if(error)return err.textContent=error.message;await writeAudit("host.slot_updated",{event_id:e.id,title:d.title,date:d.event_date,start:d.start_time,end:d.end_time});closeModal();await loadEvents();render();}); }
async function deleteHostEvent(id){if(!canManage()||!confirm("Delete this event slot?"))return;const {error}=await supabaseClient.from("events").delete().eq("id",id);if(error)return alert(error.message);await writeAudit("host.slot_deleted",{event_id:id});closeModal();await loadEvents();render();}

function renderOpsReductions() {
    return `${opsErrorNotice("reductions")}
        ${canManage() ? opsCard("Add reduction", `<form id="reductionForm" class="ops-form"><select name="staff_id" required><option value="">Select staff</option>${staff.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select><input name="amount" type="number" min="1" required placeholder="Amount"><input name="reason" maxlength="200" required placeholder="Reason"><button class="primary-button">Add reduction</button></form>`) : ""}
        ${opsCard("Reduction history", ops.reductions.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Staff</th><th>Amount</th><th>Reason</th><th>Status</th><th>Date</th></tr></thead><tbody>${ops.reductions.map(r=>`<tr><td>${escapeHtml(r.staff?.name||"Unknown")}</td><td>${Number(r.amount||0)}</td><td>${escapeHtml(r.reason||"")}</td><td>${r.active===false?"Closed":"Active"}</td><td>${formatOpsDateTime(r.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="ops-empty">No reductions recorded.</div>`)}
    `;
}

function renderOpsLogs() {
    return `${opsErrorNotice("audit")}${opsCard("Audit log", ops.audit.length ? `<div class="ops-list">${ops.audit.map(a=>`<details class="audit-item"><summary><b>${escapeHtml(a.action||"Change")}</b><span>${escapeHtml(a.actor?.name||"System")} · ${formatOpsDateTime(a.created_at)}</span></summary><pre>${escapeHtml(JSON.stringify(a.details||{},null,2))}</pre></details>`).join("")}</div>` : `<div class="ops-empty">No audit records yet.</div>`)}
    `;
}

function renderOpsSecurity() {
    const combined = [...ops.security.map(x=>({...x,_kind:"Security"})), ...ops.audit.map(x=>({...x,_kind:"Audit"}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return `${opsErrorNotice("security")}
        <div class="ops-grid-two">
            ${canManage() ? opsCard("Crashout timeout", `<form id="timeoutForm" class="ops-form"><textarea name="emails" rows="5" placeholder="user1@example.com\nuser2@example.com\nuser3@example.com" required></textarea><input name="minutes" type="number" min="1" max="10080" value="30" required><input name="reason" maxlength="200" placeholder="Reason" required><button class="danger-button">Timeout everyone</button><small>Manual timeout. Automatic crashout protection is ${Number(crashoutSettings.max_removals)} removals in ${Number(crashoutSettings.window_minutes)} minutes, then ${Number(crashoutSettings.timeout_minutes)} minutes timed out.</small></form>`) : ""}
            ${canManage() ? opsCard("Kick off / remove from team", `<form id="blockForm" class="ops-form"><textarea name="emails" rows="5" placeholder="staff@example.com\nformerstaff@example.com" required></textarea><input name="reason" maxlength="200" value="Inactivity" placeholder="Reason"><button class="danger-button">Kick off &amp; block access</button><small>Kick-offs default to <b>Inactivity</b>. Crashout protection stops an actor exceeding the configured removal limit.</small></form>`) : ""}
            ${isDirector() ? opsCard("Crashout protection settings", `<form id="crashoutSettingsForm" class="ops-form"><label>Maximum removals<input name="max_removals" type="number" min="1" max="50" value="${Number(crashoutSettings.max_removals)}" required></label><label>Window (minutes)<input name="window_minutes" type="number" min="1" max="1440" value="${Number(crashoutSettings.window_minutes)}" required></label><label>Timeout (minutes)<input name="timeout_minutes" type="number" min="1" max="10080" value="${Number(crashoutSettings.timeout_minutes)}" required></label><button class="primary-button">Save Crashout Limit</button></form>`) : ""}
        </div>
        ${opsCard("Active timeouts", (ops.timeouts||[]).length ? `<div class="ops-list">${ops.timeouts.filter(t=>new Date(t.expires_at)>new Date()).map(t=>`<div class="ops-row"><div><b>${escapeHtml(t.email)}</b><small>${escapeHtml(t.reason||"")} · until ${formatOpsDateTime(t.expires_at)}</small></div><span class="ops-pill">Timed out</span></div>`).join("")}</div>` : `<div class="ops-empty">No active timeouts.</div>`)}
        ${opsCard("Blocked accounts", (ops.blocks||[]).length ? `<div class="ops-list">${ops.blocks.map(b=>`<div class="ops-row"><div><b>${escapeHtml(b.email)}</b><small>${escapeHtml(b.reason||"")} · ${formatOpsDateTime(b.created_at)}</small></div><button class="secondary-button unblock-account" data-email="${escapeAttribute(b.email)}">Unblock</button></div>`).join("")}</div>` : `<div class="ops-empty">No blocked accounts.</div>`)}
        ${opsCard("Security & audit events", combined.length ? `<div class="ops-list">${combined.slice(0,100).map(x=>`<details class="audit-item"><summary><b>${escapeHtml(x._kind)} · ${escapeHtml(x.event_type || x.action || "Event")}</b><span>${escapeHtml(x.actor_name||"System")} · ${formatOpsDateTime(x.created_at)}</span></summary><pre>${escapeHtml(JSON.stringify(x.details||{},null,2))}</pre></details>`).join("")}</div>` : `<div class="ops-empty">No security events recorded.</div>`)}
    `;
}

function renderOpsPrizes() {
    const wins=ops.prizeWins||[], allowed=["dinheirosujo","dollars","vipevento1"], prizes=(ops.prizes||[]).filter(p=>allowed.includes(String(p.code||"").toLowerCase()));
    return `${opsErrorNotice("prizes")}<div class="ops-toolbar prize-tabs"><button class="integrated-nav-btn active">🏆 Prize Win</button><button class="integrated-nav-btn" onclick="document.getElementById('commandVault')?.scrollIntoView({behavior:'smooth'})">⌘ Commands</button></div><div class="ops-grid-two prize-page-grid">${canManage()?opsCard("Event Winner",`<form id="prizeWinPageForm" class="ops-form prize-win-page-form"><label>In-game ID<input name="discord_id" maxlength="50" placeholder="e.g. 33333" required></label><label>Type<select name="prize_id" required><option value="">Select prize type</option>${prizes.map(p=>`<option value="${p.id}">${escapeHtml(p.label)}</option>`).join("")}</select></label><label>Amount<input id="prizeWinAmount" name="amount" type="number" readonly placeholder="Auto-filled from type"></label><label>Reason<input name="reason" maxlength="160" placeholder="e.g. Event Winner" required></label><label>Command<div id="prizeWinPageCommand" class="command-preview">Enter the ID, choose a type and enter a reason.</div></label><div class="prize-command-actions"><button type="button" class="secondary-button" id="copyPrizePageCommand" disabled>Copy command</button><button type="submit" class="primary-button">Record Win &amp; Generate Command</button></div><div id="prizeWinPageError" class="form-error"></div></form>`):""}${opsCard("Prize catalogue",prizes.length?`<div class="prize-grid">${prizes.map(p=>`<div class="prize-card"><span>${escapeHtml(p.label)}</span><b>${escapeHtml(p.code)}</b><strong>${Number(p.amount||0).toLocaleString()}</strong><small>!additem ID ${escapeHtml(p.code)} ${Number(p.amount||0)} Reason</small></div>`).join("")}</div><small>Choose a prize type on the left. The amount and command code fill automatically.</small>`:`<div class="ops-empty">No prize types configured. Run the migration to seed the three event prizes.</div>`)}</div><div id="commandVault">${opsCard("Prize wins & command vault",wins.length?`<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>In-game ID</th><th>Prize</th><th>Reason</th><th>Command</th><th>Done</th><th>Won</th></tr></thead><tbody>${wins.map(w=>`<tr class="${w.completed?"prize-win-complete":""}"><td>${escapeHtml(w.discord_id||"Unknown")}</td><td>${escapeHtml(w.ops_prizes?.label||"Prize")}</td><td>${escapeHtml(w.reason||"")}</td><td><code class="command-code">${escapeHtml(w.command||"")}</code></td><td><label class="prize-done"><input type="checkbox" class="prize-done-toggle" data-id="${w.id}" ${w.completed?"checked":""}><span>${w.completed?"Done":"Pending"}</span></label></td><td>${formatOpsDateTime(w.created_at)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="ops-empty">No prize wins recorded yet.</div>`)}</div>`;
}
function renderOpsAccess() {
    const pending = accessRequests.filter(r => r.status === "pending");
    const decided = accessRequests.filter(r => r.status !== "pending").slice(0, 50);
    return `<div class="operations-main"><div class="operations-content">
        ${opsCard("Pending staff access", pending.length ? `<div class="ops-list">${pending.map(r => `
            <div class="ops-row access-request-row">
                <div><b>${escapeHtml(r.requested_name || r.discord_username || "Discord user")}</b><small>Discord: ${escapeHtml(r.discord_username || "Unknown")} · ID: ${escapeHtml(r.discord_id || "Unknown")}</small><small>Requested: <strong>${escapeHtml(String(r.requested_access_level || "member").toUpperCase())}</strong> · ${formatOpsDateTime(r.created_at)}</small></div>
                <div class="access-request-actions">${availableGrantLevels().some(([value]) => value === (r.requested_access_level || "member")) ? `<button class="primary-button small" onclick="approveAccessRequest('${r.id}', '${escapeAttribute(r.requested_access_level || "member")}')">Confirm ${escapeHtml(String(r.requested_access_level || "member").toUpperCase())}</button>` : ""}<button class="danger-button small" onclick="rejectAccessRequest('${r.id}')">Reject</button></div>
            </div>`).join("")}</div>` : `<div class="ops-empty">No pending access requests. The queue is, for once, behaving itself.</div>`, `<span class="ops-pill">${pending.length} pending</span>`)}
        ${opsCard("Recent decisions", decided.length ? `<div class="ops-list">${decided.map(r => `<div class="ops-row"><div><b>${escapeHtml(r.requested_name || r.discord_username || "Discord user")}</b><small>${escapeHtml(r.discord_id || "Unknown")} · ${escapeHtml(r.review_note || "")}</small></div><span class="ops-pill">${escapeHtml(r.status)}</span></div>`).join("")}</div>` : `<div class="ops-empty">No decisions yet.</div>`)}
    </div></div>`;
}

function renderOpsHelpers() {
    const eventOptions = events.slice().sort((a,b)=>`${a.event_date}${a.start_time}`.localeCompare(`${b.event_date}${b.start_time}`));
    return `${opsErrorNotice("helpers")}
        ${canManage() ? opsCard("Assign helper", `<form id="helperForm" class="ops-form"><select name="event_id" required><option value="">Select event</option>${eventOptions.map(e=>`<option value="${e.id}">${escapeHtml(e.event_date)} · ${escapeHtml(e.title)}</option>`).join("")}</select><select name="staff_id" required><option value="">Select helper</option>${staff.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select><input name="note" maxlength="200" placeholder="Optional note"><button class="primary-button">Assign helper</button></form>`) : ""}
        ${opsCard("Current helpers", ops.helpers.length ? `<div class="ops-list">${ops.helpers.map(h=>`<div class="ops-row"><div><b>${escapeHtml(h.staff?.name||"Unknown")}</b><small>${escapeHtml(h.events?.title||"Event")} · ${escapeHtml(h.events?.event_date||"")} ${escapeHtml(h.events?.start_time||"")}</small></div><span class="ops-pill">Helper</span></div>`).join("")}</div>` : `<div class="ops-empty">No helpers assigned.</div>`)}
    `;
}

function bindOpsHandlers() {
    document.getElementById("trackerTeamFilter")?.addEventListener("change", e => {
        document.querySelectorAll("[data-team-row]").forEach(row => row.hidden = e.target.value !== "all" && row.dataset.team !== e.target.value);
    });
    document.getElementById("openTrackerAdd")?.addEventListener("click", openTrackerAddModal);
    document.getElementById("pointsForm")?.addEventListener("submit", submitPoints);
    document.getElementById("plannedHostForm")?.addEventListener("submit", submitPlannedHostEvent);
    document.getElementById("manualHostForm")?.addEventListener("submit", submitManualHostEvent);
    document.getElementById("reductionForm")?.addEventListener("submit", submitReduction);
    document.getElementById("prizeForm")?.addEventListener("submit", submitPrize);
    bindPrizePageHandlers();
    document.getElementById("helperForm")?.addEventListener("submit", submitHelper);
    document.getElementById("timeoutForm")?.addEventListener("submit", submitTimeout);
    document.getElementById("blockForm")?.addEventListener("submit", submitBlock);
    document.getElementById("crashoutSettingsForm")?.addEventListener("submit", submitCrashoutSettings);
    document.querySelectorAll(".copy-command").forEach(btn => btn.addEventListener("click", () => copyCommand(btn.dataset.command, btn)));
    document.querySelectorAll(".unblock-account").forEach(btn => btn.addEventListener("click", () => unblockAccount(btn.dataset.email)));
    document.querySelectorAll(".ops-delete-hungry").forEach(btn => btn.addEventListener("click", () => deleteHungry(btn.dataset.id)));
    document.querySelectorAll(".ops-claim-hungry").forEach(btn => btn.addEventListener("click", () => claimHungry(btn.dataset.id)));
    document.querySelectorAll(".ops-unclaim-hungry").forEach(btn => btn.addEventListener("click", () => unclaimHungry(btn.dataset.id)));
    document.querySelectorAll(".ops-complete-hungry").forEach(btn => btn.addEventListener("click", () => completeHungry(btn.dataset.id)));
}

function openTrackerAddModal() {
    showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">Tracker</span><h2>Add activity</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form id="trackerForm" class="ops-form"><select name="staff_id" required><option value="">Select staff</option>${staff.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select><input name="team" maxlength="80" placeholder="Team" required><input name="activity_type" maxlength="80" placeholder="Activity type" required><select name="status"><option>Logged</option><option>Pending</option><option>Completed</option></select><textarea name="notes" rows="4" placeholder="Notes"></textarea><button class="primary-button">Save activity</button></form></div>`);
    document.getElementById("trackerForm")?.addEventListener("submit", submitTracker);
}

async function submitTracker(e) {
    e.preventDefault(); if(!canManage()) return;
    const f = e.target; const payload = Object.fromEntries(new FormData(f).entries()); payload.created_by=currentUser.id;
    const { error } = await supabaseClient.from("ops_tracker").insert(payload);
    if(error) return alert(error.message); await writeAudit("tracker.created", payload); closeModal(); await loadOpsData(); render();
}

async function submitPoints(e) {
    e.preventDefault(); if(!canManage()) return; const f=e.target; const payload=Object.fromEntries(new FormData(f).entries()); payload.amount=Math.max(-25,Math.min(25,Number(payload.amount))); payload.created_by=currentUser.id;
    const { error }=await supabaseClient.from("ops_points").insert(payload); if(error) return alert(error.message); await writeAudit("points.adjusted", payload); await loadOpsData(); render();
}

async function submitHungry(e) {
    e.preventDefault(); if(!canManage()) return; const payload=Object.fromEntries(new FormData(e.target).entries()); payload.created_by=currentUser.id;
    const { error }=await supabaseClient.from("ops_hungry").insert(payload); if(error) return alert(error.message); await writeAudit("hungry.created", payload); await loadOpsData(); render();
}

async function claimHungry(id) {
    if (!currentUser || permissionRank() < 1) return;
    const { data, error } = await supabaseClient.rpc("claim_hungry_slot", { p_id: id, p_claimed_by_name: getDiscordIdentity().username });
    if (error) return alert(error.message);
    await writeAudit("hungry.claimed", { id, claimed_by_name: getDiscordIdentity().username });
    await loadOpsData(); render();
}

async function unclaimHungry(id) {
    if (!currentUser) return;
    const { error } = await supabaseClient.rpc("unclaim_hungry_slot", { p_id: id });
    if (error) return alert(error.message);
    await writeAudit("hungry.unclaimed", { id });
    await loadOpsData(); render();
}

async function completeHungry(id) {
    if (!currentUser) return;
    if (!confirm("Mark this hungry-pool task as complete?")) return;
    const { error } = await supabaseClient.rpc("complete_hungry_slot", { p_id: id, p_completed_by_name: getDiscordIdentity().username });
    if (error) return alert(error.message);
    await writeAudit("hungry.completed", { id });
    await loadOpsData(); render();
}

async function deleteHungry(id) {
    if(!canManage() || !confirm("Remove this hungry-pool entry?")) return; const {error}=await supabaseClient.from("ops_hungry").delete().eq("id",id); if(error) return alert(error.message); await writeAudit("hungry.deleted",{id}); await loadOpsData(); render();
}

async function submitReduction(e) {
    e.preventDefault(); if(!canManage()) return; const payload=Object.fromEntries(new FormData(e.target).entries()); payload.amount=Math.max(1,Number(payload.amount)); payload.created_by=currentUser.id; payload.active=true;
    const {error}=await supabaseClient.from("ops_reductions").insert(payload); if(error) return alert(error.message); await writeAudit("reduction.created",payload); await loadOpsData(); render();
}

async function submitPrize(e) {
    e.preventDefault(); if(!canManage()) return; const payload=Object.fromEntries(new FormData(e.target).entries()); payload.amount=Math.max(1,Number(payload.amount)); payload.created_by=currentUser.id; payload.active=true;
    const {error}=await supabaseClient.from("ops_prizes").insert(payload); if(error) return alert(error.message); await writeAudit("prize.created",payload); await loadOpsData(); render();
}

async function submitHelper(e) {
    e.preventDefault(); if(!canManage()) return; const payload=Object.fromEntries(new FormData(e.target).entries()); payload.created_by=currentUser.id;
    const {error}=await supabaseClient.from("ops_helpers").insert(payload); if(error) return alert(error.message); await writeAudit("helper.assigned",payload); await loadOpsData(); render();
}

async function submitTimeout(e) {
    e.preventDefault();
    if (!canManage()) return;
    const f = e.target;
    const emails = String(new FormData(f).get("emails") || "").split(/\s*[\n,;]\s*/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    const minutes = Math.max(1, Math.min(10080, Number(new FormData(f).get("minutes")) || 30));
    const reason = String(new FormData(f).get("reason") || "").trim();
    const expires_at = new Date(Date.now() + minutes * 60000).toISOString();
    if (!emails.length) return;
    const rows = emails.map(email => ({ email, expires_at, reason, created_by: currentUser.id }));
    const { error } = await supabaseClient.from("ops_timeouts").insert(rows);
    if (error) return alert(error.message);
    await supabaseClient.from("ops_security").insert(emails.map(email => ({ actor_id: currentUser.id, actor_name: currentUser.email || "Staff", event_type: "timeout.created", severity: "warning", details: { email, minutes, reason, expires_at } })));
    await writeAudit("security.timeout", { emails, minutes, reason });
    await loadOpsData(); render();
}

async function submitCrashoutSettings(e) {
    e.preventDefault();
    if (!isDirector()) return;
    const data = Object.fromEntries(new FormData(e.target).entries());
    const payload = { id: 1, max_removals: Math.max(1, Math.min(50, Number(data.max_removals)||3)), window_minutes: Math.max(1, Math.min(1440, Number(data.window_minutes)||60)), timeout_minutes: Math.max(1, Math.min(10080, Number(data.timeout_minutes)||30)), updated_by: currentUser.id };
    const { error } = await supabaseClient.from('ops_security_settings').upsert(payload, { onConflict: 'id' });
    if (error) return alert(error.message);
    crashoutSettings = payload;
    await loadOpsData(); render();
}

async function submitBlock(e) {
    e.preventDefault();
    if (!canManage()) return;
    const data = new FormData(e.target);
    const emails = String(data.get("emails") || "").split(/\s*[\n,;]\s*/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    const reason = String(data.get("reason") || "Inactivity").trim() || "Inactivity";
    if (!emails.length) return;
    const windowStart = new Date(Date.now() - Number(crashoutSettings.window_minutes || 60) * 60000).toISOString();
    const { count } = await supabaseClient.from('ops_security').select('id', { count: 'exact', head: true }).eq('actor_id', currentUser.id).eq('event_type', 'team.removed').gte('created_at', windowStart);
    const currentCount = Number(count || 0);
    const limit = Number(crashoutSettings.max_removals || 3);
    if (currentCount + emails.length > limit) {
        const actorEmail = String(currentUser.email || '').toLowerCase();
        if (actorEmail) {
            const expires_at = new Date(Date.now() + Number(crashoutSettings.timeout_minutes || 30) * 60000).toISOString();
            await supabaseClient.from('ops_timeouts').insert({ email: actorEmail, expires_at, reason: `Crashout protection: ${currentCount + emails.length} removals attempted within ${crashoutSettings.window_minutes} minutes`, created_by: currentUser.id });
            await supabaseClient.from('ops_security').insert({ actor_id: currentUser.id, actor_name: currentUser.email || 'Staff', event_type: 'crashout.timeout', severity: 'critical', details: { attempted: emails.length, previous: currentCount, limit, window_minutes: crashoutSettings.window_minutes, timeout_minutes: crashoutSettings.timeout_minutes } });
            await writeAudit('security.crashout_timeout', { attempted: emails.length, previous: currentCount, limit });
            await loadAccess(); await loadOpsData(); render();
            return alert(`Crashout protection triggered. You reached the limit of ${limit} removals in ${crashoutSettings.window_minutes} minutes. You have been timed out for ${crashoutSettings.timeout_minutes} minutes.`);
        }
        return alert(`Crashout protection blocked this action. Limit: ${limit} removals in ${crashoutSettings.window_minutes} minutes.`);
    }
    const rows = emails.map(email => ({ email, reason, active: true, created_by: currentUser.id }));
    const { error } = await supabaseClient.from("ops_access_blocks").upsert(rows, { onConflict: "email" });
    if (error) return alert(error.message);
    await supabaseClient.from("ops_security").insert(emails.map(email => ({ actor_id: currentUser.id, actor_name: currentUser.email || "Staff", event_type: "team.removed", severity: "critical", details: { email, reason } })));
    await writeAudit("team.removed", { emails, reason });
    await loadOpsData(); render();
}

async function unblockAccount(email) {
    if (!isAdmin()) return alert("Admin access required to unblock accounts.");
    const { error } = await supabaseClient.from("ops_access_blocks").update({ active:false }).eq("email", email);
    if (error) return alert(error.message);
    await writeAudit("team.reinstated", { email });
    await loadOpsData(); render();
}

function bindPrizePageHandlers(){const form=document.getElementById("prizeWinPageForm");if(!form)return;const update=()=>{const prize=ops.prizes.find(p=>p.id===form.prize_id.value&&["dinheirosujo","dollars","vipevento1"].includes(String(p.code||"").toLowerCase())),amount=document.getElementById("prizeWinAmount"),box=document.getElementById("prizeWinPageCommand"),copy=document.getElementById("copyPrizePageCommand");if(amount)amount.value=prize?Number(prize.amount||0):"";const command=prize&&form.discord_id.value.trim()&&form.reason.value.trim()?`!additem ${form.discord_id.value.trim()} ${prize.code} ${Number(prize.amount||0)} ${form.reason.value.trim()}`:"Enter the ID, choose a type and enter a reason.";if(box)box.textContent=command;if(copy){copy.disabled=command.startsWith("Enter the ID");copy.dataset.command=command;}};form.addEventListener("input",update);form.addEventListener("change",update);document.getElementById("copyPrizePageCommand")?.addEventListener("click",function(){copyCommand(this.dataset.command,this);});form.addEventListener("submit",submitPrizeWinPage);document.querySelectorAll(".prize-done-toggle").forEach(cb=>cb.addEventListener("change",()=>markPrizeDone(cb.dataset.id,cb.checked)));update();}
async function submitPrizeWinPage(e){e.preventDefault();if(!canManage())return;const form=e.target,data=new FormData(form),discord_id=String(data.get("discord_id")||"").trim(),reason=String(data.get("reason")||"").trim(),prize_id=String(data.get("prize_id")||""),prize=ops.prizes.find(p=>p.id===prize_id&&["dinheirosujo","dollars","vipevento1"].includes(String(p.code||"").toLowerCase())),err=document.getElementById("prizeWinPageError");if(err)err.textContent="";if(!discord_id||!prize||!reason){if(err)err.textContent="Enter an in-game ID, choose a prize and enter a reason.";return;}const command=`!additem ${discord_id} ${prize.code} ${Number(prize.amount||0)} ${reason}`,payload={prize_id,recipient_name:discord_id,discord_id,amount:Number(prize.amount||0),reason,command,won_by:currentUser.id,completed:false};const {error}=await supabaseClient.from("ops_prize_wins").insert(payload);if(error){if(err)err.textContent=error.message;return;}await writeAudit("prize.won",payload);await loadOpsData();render();}
async function markPrizeDone(id,done){if(!canManage())return;const payload={completed:done,completed_at:done?new Date().toISOString():null,completed_by:done?currentUser.id:null},{error}=await supabaseClient.from("ops_prize_wins").update(payload).eq("id",id);if(error)return alert(error.message);await writeAudit(done?"prize.completed":"prize.reopened",{id});await loadOpsData();render();}
async function copyCommand(command, button) {
    try { await navigator.clipboard.writeText(command); button.textContent = "Copied"; setTimeout(()=>button.textContent="Copy",1200); }
    catch (_) { alert(command); }
}

async function writeAudit(action, details={}) {
    if(!currentUser) return;
    try { await supabaseClient.from("ops_audit").insert({actor_id: currentUser.id, actor_name: currentUser.email || "Staff", action, details}); } catch (_) {}
}

function buildRecurringDates(startDate, repeat, untilDate) {
    const dates = [startDate];
    if (repeat === "none") return dates;
    const current = new Date(`${startDate}T12:00:00`);
    const until = new Date(`${untilDate}T12:00:00`);
    const step = repeat === "weekly" ? 7 : repeat === "biweekly" ? 14 : 0;
    let guard = 0;
    while (guard++ < 52) {
        if (repeat === "monthly") current.setMonth(current.getMonth() + 1);
        else current.setDate(current.getDate() + step);
        if (current > until) break;
        dates.push(formatDate(current));
    }
    return dates;
}

function isEventCompleted(event) {
    return event.status === "completed";
}

function applyEventPreset(preset) {
    const title = document.getElementById("eventTitle");
    if (!title) return;
    title.value = preset;
    const type = eventTypes.find(t => String(t.name || "").toLowerCase() === preset.toLowerCase());
    if (type) document.getElementById("eventType").value = type.id;
    if (preset === "Community Meeting") {
        document.getElementById("eventVisibility").value = "staff";
        document.getElementById("eventRepeat").value = "biweekly";
    }
}

function renderAccessRestriction() {
    const timeout = currentTimeout;
    const blocked = accessBlock;
    app.innerHTML = `<div class="schedule-app"><main class="restricted-screen"><div class="restricted-card"><div class="schedule-logo crown-logo">♛</div><h1>${blocked ? "Access Removed" : "Temporarily Timed Out"}</h1><p>${blocked ? `Your KNG Entertainment access has been removed from the team.` : `Your access is temporarily unavailable until ${formatOpsDateTime(timeout?.expires_at)}.`}</p><small>${escapeHtml((blocked?.reason || timeout?.reason || "Contact management."))}</small><button class="header-button" onclick="logout()">Sign Out</button></div></main></div>`;
}

function formatOpsDateTime(value) {
    if(!value) return "";
    const d=new Date(value); if(Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-GB", {day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"});
}

window.switchOpsView = switchOpsView;
window.loginWithDiscord = loginWithDiscord;
window.requestStaffAccess = requestStaffAccess;
window.approveAccessRequest = approveAccessRequest;
window.rejectAccessRequest = rejectAccessRequest;
window.openPrizeWinModal = () => switchOpsView("prizes");
window.copyCommand = copyCommand;
window.submitCrashoutSettings = submitCrashoutSettings;



/* =========================================================
   KNG INTERACTIONS INTEGRATION
   Recreates the useful Interactions screens shown in the source
   website while keeping this app's Supabase/auth architecture.
   ========================================================= */

async function loadInteractionData() {
    const [hof, suggestions] = await Promise.all([
        loadOpsTable("ix_hall_of_fame", () => supabaseClient.from("ix_hall_of_fame").select("*").order("created_at", {ascending:false}).limit(100)),
        loadOpsTable("event_suggestions", () => supabaseClient.from("event_suggestions").select("*").order("created_at", {ascending:false}).limit(200))
    ]);
    let goals = [];
    if (currentUser) {
        goals = await loadOpsTable("ix_daily_goals", () => supabaseClient.from("ix_daily_goals").select("*").eq("user_id", currentUser.id).order("goal_date", {ascending:false}).limit(30));
    }
    ixData = { hof, goals, suggestions };
}

function interactionHeader(title, subtitle) {
    return `<header class="schedule-header ops-header interaction-header">
        <div class="schedule-brand"><div class="schedule-logo crown-logo">♛</div><div><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div></div>
        <div class="schedule-header-actions">
            <span class="mode-badge ${canManage() ? "staff-mode" : "player-mode"}">${canManage() ? "STAFF MODE" : "PLAYER VIEW"}</span>
            ${canManage() ? `<button class="header-button" onclick="openCreateEventModal()">+ Create Event</button>` : ""}
            ${isAdmin() ? `<button class="header-button" onclick="openCreateMeetingModal()">+ Meeting</button>` : ""}
            ${currentUser ? `<button class="header-button" onclick="logout()">Logout</button>` : `<button class="header-button" onclick="openLogin()">Discord Login</button>`}<button class="header-button" onclick="goToday()">Today</button>
        </div>
    </header>`;
}

function renderInteractionView() {
    const publicViews = ["event-suggestions"];
    const staffOnlyViews = ["command-dashboard", "interactions-leaderboard", "hall-of-fame"];
    if (staffOnlyViews.includes(ixView) && permissionRank() < 1) {
        ixView = "event-suggestions";
        try { localStorage.setItem("kng.ixView", "event-suggestions"); } catch (_) {}
    }
    if (!currentUser && !publicViews.includes(ixView)) { showLoginMessage(); return; }
    const titles = {
        "command-dashboard":["Command Dashboard","KNG Interactions + Entertainment command centre"],
        "interactions-leaderboard":["Leaderboard","Staff activity, events and points"],
        "hall-of-fame":["Hall of Fame","Winner frames and event recognition"],
        "daily-goals":["Daily Goals","Track your interaction target"],
        "staff-roster":["Staff Roster","Current KNG Entertainment staff"],
        "event-suggestions":["Event Suggestions","Public ideas and feedback for future events"]
    };
    const [title,subtitle]=titles[ixView] || titles["command-dashboard"];
    app.innerHTML=`<div class="schedule-app operations-app ix-integration-app">${interactionHeader(title,subtitle)}<div class="app-body operations-body">${operationsNavHtml()}<main class="operations-main"><div class="operations-content">${renderIxViewHtml()}</div></main></div><div id="modalContainer"></div></div>`;
    bindInteractionHandlers();
}

function renderIxViewHtml(){
    switch(ixView){
        case "command-dashboard": return renderInteractionDashboard();
        case "interactions-leaderboard": return renderInteractionLeaderboard();
        case "hall-of-fame": return renderHallOfFame();
        case "daily-goals": return renderDailyGoals();
        case "staff-roster": return renderStaffRoster();
        case "event-suggestions": return renderEventSuggestions();
        default: return renderInteractionDashboard();
    }
}

function renderInteractionDashboard(){
    const today=formatDate(new Date());
    const todayEvents=allEvents.filter(e=>e.event_date===today && !e.is_meeting);
    const completed=allEvents.filter(e=>!e.is_meeting && isEventCompleted(e));
    const popular=[...completed].filter(e=>Number.isFinite(Number(e.attendance_count))).sort((a,b)=>Number(b.attendance_count||0)-Number(a.attendance_count||0)).slice(0,5);
    return `<div class="ix-command-grid">
      <div class="ix-stat-row">
        <div class="ix-stat"><span>Events Today</span><strong>${todayEvents.length}</strong><small>scheduled entertainment events</small></div>
        <div class="ix-stat"><span>Completed Events</span><strong>${completed.length}</strong><small>manually confirmed</small></div>
        <div class="ix-stat"><span>Event Ideas</span><strong>${(ixData.suggestions||[]).length}</strong><small>community suggestions</small></div>
        <div class="ix-stat"><span>Top Attendance</span><strong>${popular[0]?.attendance_count || 0}</strong><small>${popular[0] ? escapeHtml(popular[0].title) : 'No completed events yet'}</small></div>
      </div>
      <div class="ix-two-col">
        ${ixPanel("Today's Schedule", todayEvents.length?`<div class="ix-schedule-list">${todayEvents.slice(0,10).map(e=>`<div><span>${formatTime(e.start_time)}</span><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.event_types?.name||"Event")}</small></div>`).join("")}</div>`:`<div class="ix-empty">Nothing scheduled today.</div>`)}
        ${ixPanel("Quick Actions",`<div class="ix-quick-grid"><button onclick="switchOpsView('interactions-leaderboard')">Leaderboard</button><button onclick="switchOpsView('hall-of-fame')">Hall of Fame</button><button onclick="switchOpsView('event-suggestions')">Event Suggestions</button>${currentUser?`<button onclick="switchOpsView('daily-goals')">Daily Goals</button>`:''}</div>`)}
      </div>
    </div>`;
}

function ixPanel(title,body,action=""){ return `<section class="ix-panel"><div class="ix-panel-head"><div><h3>${escapeHtml(title)}</h3></div>${action}</div>${body}</section>`; }

function renderInteractionLeaderboard(){
    const completed=allEvents.filter(e=>!e.is_meeting && isEventCompleted(e) && Number.isFinite(Number(e.attendance_count)));
    const most=[...completed].sort((a,b)=>Number(b.attendance_count||0)-Number(a.attendance_count||0));
    const least=[...completed].sort((a,b)=>Number(a.attendance_count||0)-Number(b.attendance_count||0));
    const eventRows=(rows, empty)=>rows.length?`<div class="ix-table">${rows.map((e,i)=>`<div class="ix-table-row"><span class="ix-rank">#${i+1}</span><div class="ix-grow"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.event_types?.name||'Event')} · ${escapeHtml(e.event_date)}</small></div><span><b>${Number(e.attendance_count||0)}</b><small>attended</small></span><span class="ix-pill">${e.winner_name?`Winner: ${escapeHtml(e.winner_name)}`:'Completed'}</span></div>`).join('')}</div>`:`<div class="ix-empty">${empty}</div>`;
    return `<div class="ix-two-col"><div class="ix-panel"><div class="ix-panel-head"><div><h3>Most Popular Events</h3><small>Highest recorded attendance</small></div></div>${eventRows(most,'No completed attendance records yet.')}</div><div class="ix-panel"><div class="ix-panel-head"><div><h3>Least Popular Events</h3><small>Lowest recorded attendance</small></div></div>${eventRows(least,'No completed attendance records yet.')}</div></div>`;
}

function renderAnnouncements(){ return ''; }

function renderEventSuggestions(){
    const suggestions=ixData.suggestions || [];
    return `<div class="ix-panel event-suggestions-forum"><div class="ix-panel-head"><div><h3>Event Suggestions</h3><small>Public forum for KNG Entertainment event ideas</small></div><button class="primary-button" onclick="openNewEventSuggestionModal()">+ Suggest an Event</button></div><div class="suggestion-list">${suggestions.map(s=>`<article class="suggestion-card"><div><span class="ix-label">${escapeHtml(s.status||'NEW')}</span><small>${formatOpsDateTime(s.created_at)}</small></div><h4>${escapeHtml(s.title||'Event idea')}</h4><p>${escapeHtml(s.suggestion||'')}</p><small>Posted by ${escapeHtml(s.display_name||'Anonymous')}</small>${canManage()?`<button class="ix-danger-link" onclick="moderateSuggestion('${s.id}')">Mark reviewed</button>`:''}</article>`).join('') || `<div class="ix-empty">No suggestions yet. Be the first human to have an idea.</div>`}</div></div>`;
}

async function moderateSuggestion(id){
    if(!canManage()) return;
    const {error}=await supabaseClient.from('event_suggestions').update({status:'reviewed',updated_at:new Date().toISOString()}).eq('id',id);
    if(error) return alert(error.message);
    await loadInteractionData(); render();
}

function renderHallOfFame(){
    const current=ixData.hof[0] || {};
    const frames=[
        {name:'Original', key:'original', src:'kng-hof-original.png'},
        {name:'Gold', key:'gold', src:'kng-hof-gold.png'},
        {name:'Emerald', key:'emerald', src:'kng-hof-emerald.png'},
        {name:'Ocean', key:'ocean', src:'kng-hof-ocean.png'},
        {name:'Sunset', key:'sunset', src:'kng-hof-sunset.png'},
        {name:'Pink', key:'pink', src:'kng-hof-pink.png'},
        {name:'Grey Scale', key:'grey-scale', src:'kng-hof-grey-scale.png'},
        {name:'Colour Wheel', key:'colour-wheel', src:'kng-hof-grey-scale.png'},
        {name:'Fire', key:'fire', src:'kng-hof-grey-scale.png'},
        {name:'Rainbow', key:'rainbow', src:'kng-hof-grey-scale.png'},
        {name:'Custom', key:'custom', src:'kng-hof-grey-scale.png'}
    ];
    const selected=String(current.frame||'Original').toLowerCase().replace(/\s+/g,'-') || 'original';
    const colour=current.frame_colour || '#ff19b7';
    const safeUrl=escapeHtml(current.image_url||'');
    return `${ixSchemaNotice("ix_hall_of_fame")}<div class="ix-hof-layout ix-hof-layout-v2">
      <div class="ix-hof-canvas ix-hof-stage">
        <div class="hof-composer" id="hofComposer" data-frame="${escapeHtml(selected)}" style="--hof-custom:${escapeHtml(colour)}">
          <img id="hofFrameImage" class="hof-frame-image" src="${hofFrameAsset(selected)}" alt="KNG Estate Roleplay Hall of Fame frame">
          <div class="hof-photo-window" id="hofPhotoWindow">
            ${safeUrl?`<img id="hofWinnerPhoto" class="hof-winner-photo" src="${safeUrl}" alt="Winner" style="--hof-scale:${Number(current.photo_scale)||1};--hof-x:${Number(current.photo_x)||0}px;--hof-y:${Number(current.photo_y)||0}px">`:`<span class="hof-photo-placeholder">Add winner photo</span>`}
          </div>
        </div>
      </div>
      <div class="ix-hof-controls">
        <div class="ix-panel hof-control-panel">
          <div class="ix-panel-head"><div><h3>Hall of Fame</h3><small>Build the winner card exactly like the KNG frame.</small></div></div>
          <div class="hof-control-section"><b>Frame Library</b><div class="ix-frame-grid hof-frame-grid">${frames.map(f=>`<button class="ix-frame-chip hof-frame-chip ${selected===f.key?'active':''}" data-hof-frame="${f.key}" onclick="selectHofFrame('${f.key}')">${escapeHtml(f.name)}</button>`).join('')}</div></div>
          <label>Winner name<input id="hofWinnerName" value="${escapeHtml(current.winner_name||'')}" placeholder="Winner name"></label>
          <div class="hof-photo-actions">${canManage()?`<button class="header-button" onclick="openHofUpload()">Add winner photo</button>`:''}<button class="header-button" onclick="resetHofPhoto()">Reset photo</button></div>
          <div class="hof-colour-panel" id="hofCustomControls">
            <div class="hof-colour-top"><div class="hof-colour-swatch" id="hofColourSwatch" style="background:${escapeAttribute(colour)}" onclick="document.getElementById('hofColour')?.click()"></div><input id="hofHex" class="hof-hex-input" value="${escapeAttribute(colour.toUpperCase())}" maxlength="7" aria-label="Hex colour" oninput="applyHofHex(this.value)"><span id="hofRgb" class="hof-rgb">${escapeHtml(hofRgbLabel(colour))}</span></div>
            <label class="hof-range-label"><span>Hue</span><input id="hofHue" type="range" min="0" max="359" value="${hofHueFromHex(colour)}" oninput="applyHofHue(this.value)"><small id="hofHueValue">${hofHueFromHex(colour)}°</small></label>
            <label class="hof-range-label"><span>Intensity</span><input id="hofIntensity" type="range" min="0" max="100" value="${Math.round((Number(current.intensity)||100))}" oninput="applyHofCustomIntensity(this.value)"><small id="hofIntensityValue">${Math.round((Number(current.intensity)||100))}%</small></label>
            <button type="button" class="secondary-button" onclick="resetHofColour()">Reset colour</button>
            <input id="hofColour" type="color" value="${escapeAttribute(colour)}" oninput="applyHofCustomColour(this.value)" style="position:absolute;left:-9999px;opacity:0;pointer-events:none">
          </div>
          <div class="hof-help">Drag the winner photo inside the black box. Scroll to zoom.</div>
          <div class="hof-action-row">${canManage()?`<button class="primary-button" onclick="saveHallOfFame()">Save Winner</button>`:""}<button class="header-button" onclick="downloadHallOfFame()">Download</button></div>
        </div>
      </div>
    </div>`;
}

function hofFrameAsset(key){
    if(key==='original') return 'kng-hof-original.png';
    if(['gold','emerald','ocean','sunset','pink','grey-scale'].includes(key)) return `kng-hof-${key}.png`;
    return 'kng-hof-grey-scale.png';
}
function hofRgbLabel(hex){
    const value=String(hex||'').replace('#','');
    if(!/^[0-9a-fA-F]{6}$/.test(value)) return 'rgb(255, 25, 183)';
    return `rgb(${parseInt(value.slice(0,2),16)}, ${parseInt(value.slice(2,4),16)}, ${parseInt(value.slice(4,6),16)})`;
}
function hofHueFromHex(hex){
    const value=String(hex||'').replace('#','');
    if(!/^[0-9a-fA-F]{6}$/.test(value)) return 330;
    const r=parseInt(value.slice(0,2),16)/255,g=parseInt(value.slice(2,4),16)/255,b=parseInt(value.slice(4,6),16)/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min; let h=0;
    if(d){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0)h+=360; }
    return Math.round(h);
}
function hofHslToHex(h,s=90,l=55){
    s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r=0,g=0,b=0;
    if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}
    return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function updateHofColourMeta(value){
    const hex=String(value||'#FF19B7').toUpperCase();
    const swatch=document.getElementById('hofColourSwatch'); if(swatch) swatch.style.background=hex;
    const hexEl=document.getElementById('hofHex'); if(hexEl && /^#[0-9A-F]{6}$/.test(hex)) hexEl.value=hex;
    const rgb=document.getElementById('hofRgb'); if(rgb) rgb.textContent=hofRgbLabel(hex);
    const hue=hofHueFromHex(hex); const hueEl=document.getElementById('hofHue'); if(hueEl) hueEl.value=String(hue);
    const hueValue=document.getElementById('hofHueValue'); if(hueValue) hueValue.textContent=`${hue}°`;
}
function applyHofHue(value){
    const hue=Math.max(0,Math.min(359,Number(value)||0));
    const hex=hofHslToHex(hue); const input=document.getElementById('hofColour'); if(input) input.value=hex;
    applyHofCustomColour(hex); const hueValue=document.getElementById('hofHueValue'); if(hueValue) hueValue.textContent=`${hue}°`;
}
function applyHofHex(value){
    let hex=String(value||'').trim().toUpperCase(); if(!hex.startsWith('#')) hex='#'+hex;
    if(/^#[0-9A-F]{6}$/.test(hex)){ const input=document.getElementById('hofColour'); if(input) input.value=hex; applyHofCustomColour(hex); updateHofColourMeta(hex); }
}
function resetHofColour(){
    const hex='#FF19B7'; const input=document.getElementById('hofColour'); if(input) input.value=hex; applyHofCustomColour(hex); updateHofColourMeta(hex);
}

function selectHofFrame(key){
    const composer=document.getElementById('hofComposer'); if(!composer) return;
    composer.dataset.frame=key;
    composer.style.setProperty('--hof-custom', document.getElementById('hofColour')?.value || '#ff19b7');
    document.querySelectorAll('.hof-frame-chip').forEach(b=>b.classList.toggle('active',b.dataset.hofFrame===key));
    const img=document.getElementById('hofFrameImage'); if(img) img.src=hofFrameAsset(key);
    composer.classList.remove('hof-effect-wheel','hof-effect-fire','hof-effect-rainbow','hof-effect-custom');
    if(key==='colour-wheel') composer.classList.add('hof-effect-wheel');
    if(key==='fire') composer.classList.add('hof-effect-fire');
    if(key==='rainbow') composer.classList.add('hof-effect-rainbow');
    if(key==='custom') composer.classList.add('hof-effect-custom');
}
function applyHofCustomColour(value){
    const composer=document.getElementById('hofComposer'); if(!composer)return;
    const hex=String(value||'#FF19B7').toUpperCase();
    composer.style.setProperty('--hof-custom',hex);
    const input=document.getElementById('hofColour'); if(input && input.value!==hex) input.value=hex;
    updateHofColourMeta(hex);
    if(composer.dataset.frame==='custom') selectHofFrame('custom');
}
function applyHofCustomIntensity(value){
    const composer=document.getElementById('hofComposer'); if(!composer)return;
    const intensity=Math.max(0,Math.min(100,Number(value)||0));
    composer.style.setProperty('--hof-intensity',`${intensity/100}`);
    const label=document.getElementById('hofIntensityValue'); if(label) label.textContent=`${intensity}%`;
}
function resetHofPhoto(){
    const img=document.getElementById('hofWinnerPhoto'); if(!img)return;
    img.style.setProperty('--hof-scale','1'); img.style.setProperty('--hof-x','0px'); img.style.setProperty('--hof-y','0px');
}
function bindHofPhotoControls(){
    const win=document.getElementById('hofPhotoWindow'), img=document.getElementById('hofWinnerPhoto'); if(!win||!img)return;
    let dragging=false,sx=0,sy=0,ox=0,oy=0;
    win.onpointerdown=e=>{ if(!img.src)return; dragging=true;sx=e.clientX;sy=e.clientY;ox=parseFloat(img.style.getPropertyValue('--hof-x'))||0;oy=parseFloat(img.style.getPropertyValue('--hof-y'))||0;win.setPointerCapture?.(e.pointerId); };
    win.onpointermove=e=>{ if(!dragging)return; img.style.setProperty('--hof-x',`${ox+e.clientX-sx}px`);img.style.setProperty('--hof-y',`${oy+e.clientY-sy}px`); };
    win.onpointerup=()=>dragging=false; win.onpointercancel=()=>dragging=false;
    win.onwheel=e=>{ if(!img.src)return;e.preventDefault();const current=parseFloat(img.style.getPropertyValue('--hof-scale'))||1;const next=Math.max(.5,Math.min(3,current+(e.deltaY<0?.08:-.08)));img.style.setProperty('--hof-scale',next); };
}
async function saveHallOfFame(){
    if(!canManage())return;
    const winner_name=document.getElementById('hofWinnerName')?.value.trim();
    if(!winner_name) return alert('Enter a winner name first.');
    const image_url=document.getElementById('hofWinnerPhoto')?.src || '';
    const composer=document.getElementById('hofComposer');
    const frame=composer?.dataset.frame || 'original';
    const frame_colour=document.getElementById('hofColour')?.value||'#ff19b7';
    const intensity=Number(document.getElementById('hofIntensity')?.value||100);
    const photo=document.getElementById('hofWinnerPhoto');
    const photo_x=parseFloat(photo?.style.getPropertyValue('--hof-x'))||0;
    const photo_y=parseFloat(photo?.style.getPropertyValue('--hof-y'))||0;
    const photo_scale=parseFloat(photo?.style.getPropertyValue('--hof-scale'))||1;
    const frame_mode=['colour-wheel','fire','rainbow','custom'].includes(frame)?frame:'none';
    const hue=hofHueFromHex(frame_colour);
    const payload={winner_name,image_url,frame,frame_colour,frame_mode,hue,intensity,photo_x,photo_y,photo_scale,created_by:currentUser.id};
    const {error}=await supabaseClient.from('ix_hall_of_fame').insert(payload);
    if(error){
        if(String(error.message||'').toLowerCase().includes('schema cache') || String(error.message||'').toLowerCase().includes('does not exist')) {
            return showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">Hall of Fame</span><h2>Database setup required</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><p class="modal-message">The Hall of Fame table is not installed yet. Run <b>KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql</b> in Supabase, then refresh the site.</p><div class="modal-footer"><button class="primary-button" onclick="closeModal()">Close</button></div></div>`);
        }
        return alert(error.message);
    }
    await loadInteractionData(); render();
}
async function downloadHallOfFame(){
    const composer=document.getElementById('hofComposer'); const frameImg=document.getElementById('hofFrameImage'); if(!composer||!frameImg)return;
    const canvas=document.createElement('canvas'); const w=1428,h=1806; canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
    const frame=new Image();frame.crossOrigin='anonymous';frame.src=frameImg.src;await new Promise(r=>{frame.onload=r;frame.onerror=r});ctx.drawImage(frame,0,0,w,h);
    const photo=document.getElementById('hofWinnerPhoto'); if(photo?.src){ const p=new Image();p.crossOrigin='anonymous';p.src=photo.src;await new Promise(r=>{p.onload=r;p.onerror=r});
      const win={x:182,y:654,w:1089,h:820};const scale=parseFloat(photo.style.getPropertyValue('--hof-scale'))||1;const x=parseFloat(photo.style.getPropertyValue('--hof-x'))||0;const y=parseFloat(photo.style.getPropertyValue('--hof-y'))||0;ctx.save();ctx.beginPath();ctx.rect(win.x,win.y,win.w,win.h);ctx.clip();const size=Math.max(win.w,win.h)*scale;ctx.drawImage(p,win.x+(win.w-size)/2+x,win.y+(win.h-size)/2+y,size,size);ctx.restore(); }
    const a=document.createElement('a');a.download=`KNG-Hall-of-Fame-${(document.getElementById('hofWinnerName')?.value||'Winner').replace(/[^a-z0-9_-]+/gi,'-')}.png`;a.href=canvas.toDataURL('image/png');a.click();
}
function openHofUpload(){
    if(!canManage()) return; const input=document.createElement('input'); input.type='file'; input.accept='image/*';
    input.onchange=async()=>{ const file=input.files?.[0]; if(!file)return; const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${currentUser.id}/${Date.now()}.${ext}`; const {error}=await supabaseClient.storage.from('kng-hall-of-fame').upload(path,file,{upsert:false,contentType:file.type}); if(error)return alert(error.message); const {data}=supabaseClient.storage.from('kng-hall-of-fame').getPublicUrl(path); const old=document.getElementById('hofPhotoWindow'); if(old){old.innerHTML=`<img id="hofWinnerPhoto" class="hof-winner-photo" src="${escapeHtml(data.publicUrl)}" alt="Winner" style="--hof-scale:1;--hof-x:0px;--hof-y:0px">`;bindHofPhotoControls();} };
    input.click();
}

function renderDailyGoals(){
    const today=formatDate(new Date());
    const goal=ixData.goals.find(g=>g.goal_date===today) || {target_points:8,points_earned:0};
    const earned=Number(goal.points_earned||0), target=Math.max(1,Number(goal.target_points||8)), pct=Math.min(100,Math.round(earned/target*100));
    return `${ixSchemaNotice("ix_daily_goals")}<div class="ix-goal-wrap"><div class="ix-goal-card"><div class="ix-ring" style="--pct:${pct}%"><div><strong>${earned}</strong><small>/ ${target}</small></div></div><h3>Daily Goal</h3><p>${pct>=100?"Goal completed. Nice work.":`You need ${Math.max(0,target-earned)} more points to hit today's target.`}</p><div class="ix-progress"><span style="width:${pct}%"></span></div><small>${pct}% complete</small>${isDirector()?`<button class="header-button" onclick="saveDailyGoal()">Set Target</button>`:""}</div></div>`;
}

function renderStaffRoster(){
    if (!currentUser || !canManage()) return `<div class="ix-panel"><div class="ix-empty">Staff access required.</div></div>`;
    const allocated=new Set(rosterData.map(r=>String(r.staff_id)));
    const unallocated=staff.filter(s=>!allocated.has(String(s.id)));
    const renderTeam=team=>{
        const rows=rosterData.filter(r=>r.team===team).sort((a,b)=>rosterLevelRank(b.hierarchy_level)-rosterLevelRank(a.hierarchy_level)||String(a.staff?.name||'').localeCompare(String(b.staff?.name||'')));
        const groups=['director','manager','adm','aux','ld','sub_ld','member'];
        return groups.map(level=>{
            const members=rows.filter(r=>r.hierarchy_level===level);
            if(!members.length) return '';
            return `<div class="roster-group"><div class="roster-group-title">${escapeHtml(rosterLevelLabel(level,team))}</div><div class="roster-table"><div class="roster-head"><span>NAME</span><span>ID</span><span>DISCORD</span><span>STRIKES</span><span>MENTOR</span><span>ALOPA</span><span>ACTIONS</span></div>${members.map(r=>`<div class="roster-row"><span class="roster-name"><b>${escapeHtml(r.staff?.name||'Unknown')}</b></span><span>${escapeHtml(r.kng_id||'N/A')}</span><span>${escapeHtml(r.staff?.discord_id||r.discord_id||'N/A')}</span><span>${Number(r.strikes||0)}/3</span><span>${r.mentor?'Yes':'N/A'}</span><span>${r.on_alopa?'Yes':'No'}</span><span class="roster-actions"><button class="mini-btn" onclick="promoteRosterMember('${r.id}')">PROMOTE</button><button class="mini-btn" onclick="openRosterEditModal('${r.id}')">EDIT</button><button class="mini-btn danger" onclick="deleteRosterMember('${r.id}')">DELETE</button></span></div>`).join('')}</div></div>`;
        }).join('') || `<div class="ix-empty">No ${team} staff allocated yet.</div>`;
    };
    return `<div class="roster-page"><div class="ix-panel"><div class="ix-panel-head"><div><h3>Actions & Interactions Role Allocation</h3><small>Each staff member can be allocated to one side only.</small></div><button class="primary-button" onclick="openRosterExportModal()">Export to Discord</button></div><div class="allocation-grid">${unallocated.map(s=>`<div class="allocation-card"><div><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.discord_id||'No Discord ID')}</small></div><div><button class="mini-btn" onclick="allocateEntertainmentTeam('${s.id}','actions')">ACTIONS</button><button class="mini-btn" onclick="allocateEntertainmentTeam('${s.id}','interactions')">INTERACTIONS</button></div></div>`).join('') || `<div class="ix-empty">Everyone is already allocated to a side.</div>`}</div></div><div class="roster-hierarchy"><section class="roster-team-panel"><div class="roster-team-title">ACTIONS</div>${renderTeam('actions')}</section><section class="roster-team-panel"><div class="roster-team-title">INTERACTIONS</div>${renderTeam('interactions')}</section></div></div>`;
}

function bindInteractionHandlers(){ }

async function openAnnouncementModal(){
    if(!canManage()) return;
    showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">Announcement</span><h2>New Announcement</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form id="ixAnnForm" class="ops-form"><input name="title" placeholder="Title" required maxlength="120"><select name="category"><option>UPDATE</option><option>IMPORTANT</option><option>EVENT</option><option>STAFF</option></select><textarea name="body" placeholder="Announcement" required rows="6"></textarea><button class="primary-button">Publish</button></form></div>`);
    document.getElementById("ixAnnForm")?.addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const {error}=await supabaseClient.from("ix_announcements").insert({...d,created_by:currentUser.id});if(error)return alert(error.message);closeModal();await loadInteractionData();render();});
}

async function deleteAnnouncement(id){ if(!canManage()||!confirm("Delete this announcement?"))return;const {error}=await supabaseClient.from("ix_announcements").delete().eq("id",id);if(error)return alert(error.message);await loadInteractionData();render(); }
async function submitEventFeedback(eventId, form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const rating = Number(data.rating || 5);
    const feedback = String(data.feedback || '').trim();
    const name = String(data.display_name || '').trim() || 'Anonymous';
    if (!feedback) return alert('Please enter some feedback.');
    const { error } = await supabaseClient.from('event_feedback').insert({
        event_id: eventId,
        display_name: name,
        rating: Math.max(1, Math.min(5, rating)),
        feedback
    });
    if (error) return alert(error.message);
    closeModal();
    await loadEvents();
    openEvent(eventId);
}

async function submitEventSuggestion(eventId, form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const suggestion = String(data.suggestion || '').trim();
    const name = String(data.display_name || '').trim() || 'Anonymous';
    if (!suggestion) return alert('Please enter your suggestion.');
    const { error } = await supabaseClient.from('event_suggestions').insert({
        event_id: eventId || null,
        display_name: name,
        title: eventId ? `Suggestion for ${selectedEvent?.title || 'event'}` : 'Event suggestion',
        suggestion,
        status: 'new'
    });
    if (error) return alert(error.message);
    closeModal();
    alert('Thank you. Your suggestion has been submitted.');
}

function openEventFeedbackModal(eventId, mode='feedback') {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const title = mode === 'suggestion' ? 'Suggest something' : 'Give event feedback';
    showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">${escapeHtml(event.title)}</span><h2>${title}</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form class="ops-form" onsubmit="event.preventDefault();${mode === 'suggestion' ? `submitEventSuggestion('${event.id}', this)` : `submitEventFeedback('${event.id}', this)`}"><input name="display_name" maxlength=80 placeholder="Your name (optional)">${mode === 'suggestion' ? `<textarea name="suggestion" rows=6 maxlength=1500 placeholder="What would you change or add?" required></textarea>` : `<select name="rating"><option value=5>★★★★★ Excellent</option><option value=4>★★★★ Great</option><option value=3>★★★ Good</option><option value=2>★★ Needs work</option><option value=1>★ Poor</option></select><textarea name="feedback" rows=6 maxlength=1500 placeholder="Tell us what you thought..." required></textarea>`}<button class="primary-button">Submit</button></form></div>`);
}

async function openEventSuggestionForum() {
    ixView = 'event-suggestions';
    try { localStorage.setItem('kng.ixView', ixView); } catch (_) {}
    await loadInteractionData();
    render();
}

function openNewEventSuggestionModal() {
    showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">KNG Entertainment</span><h2>Suggest an Event</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form class="ops-form" onsubmit="event.preventDefault();submitForumSuggestion(this)"><input name="display_name" maxlength=80 placeholder="Your name (optional)"><input name="title" maxlength=120 placeholder="Event idea title" required><textarea name="suggestion" rows=7 maxlength=1500 placeholder="Describe your event idea..." required></textarea><button class="primary-button">Post Suggestion</button></form></div>`);
}

async function submitForumSuggestion(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const { error } = await supabaseClient.from('event_suggestions').insert({
        event_id: null, display_name: String(data.display_name || '').trim() || 'Anonymous', title: String(data.title || '').trim(), suggestion: String(data.suggestion || '').trim(), status: 'new'
    });
    if (error) return alert(error.message);
    closeModal();
    await loadInteractionData();
    render();
}

async function loadRosterData() {
    if (!currentUser || !canManage()) { rosterData = []; return; }
    const { data, error } = await supabaseClient.from('entertainment_roster').select('*, staff(id,name,discord_id,active)').eq('active', true).order('team').order('hierarchy_level');
    if (error) { console.error('Roster load failed:', error); rosterData = []; return; }
    rosterData = data || [];
}

function rosterLevelRank(level) {
    return ({ director: 7, manager: 6, adm: 5, aux: 4, ld: 3, sub_ld: 2, member: 1 }[level] || 1);
}

function rosterLevelLabel(level, team) {
    if (level === 'manager') return `Manager Of ${team === 'actions' ? 'Actions' : 'Interactions'}`;
    if (level === 'sub_ld') return 'Sub-LD';
    return String(level || 'member').toUpperCase();
}

async function allocateEntertainmentTeam(staffId, team) {
    if (!canManage()) return;
    if (!['actions','interactions'].includes(team)) return;
    const existing = rosterData.find(r => String(r.staff_id) === String(staffId));
    if (existing) return alert(`This staff member is already allocated to ${existing.team}. Edit their roster entry to change it.`);
    const staffRow = staff.find(s => String(s.id) === String(staffId));
    const { error } = await supabaseClient.from('entertainment_roster').insert({
        staff_id: staffId, team, hierarchy_level: 'member', kng_id: '', discord_id: staffRow?.discord_id || '', strikes: 0, mentor: false, on_alopa: false, notes: '', active: true, created_by: currentUser.id, updated_by: currentUser.id
    });
    if (error) return alert(error.message);
    await loadRosterData(); render();
}

async function promoteRosterMember(id) {
    if (!canManage()) return;
    const row = rosterData.find(r => r.id === id);
    if (!row) return;
    const order = ['member','sub_ld','ld','aux','adm','manager','director'];
    const next = order[Math.min(order.indexOf(row.hierarchy_level) + 1, order.length - 1)];
    if (next === row.hierarchy_level) return alert('They are already at the highest level.');
    const { error } = await supabaseClient.from('entertainment_roster').update({ hierarchy_level: next, updated_by: currentUser.id }).eq('id', id);
    if (error) return alert(error.message);
    await loadRosterData(); render();
}

async function deleteRosterMember(id) {
    if (!canManage() || !confirm('Remove this staff member from the Entertainment roster?')) return;
    const { error } = await supabaseClient.from('entertainment_roster').update({ active: false, updated_by: currentUser.id }).eq('id', id);
    if (error) return alert(error.message);
    await loadRosterData(); render();
}

function openRosterEditModal(id) {
    if (!canManage()) return;
    const row = rosterData.find(r => r.id === id);
    if (!row) return;
    const s = row.staff || {};
    showModal(`<div class="modal roster-edit-modal"><div class="modal-header"><div><span class="modal-eyebrow">KNG Entertainment</span><h2>Edit roster member</h2><small>Rank changes must use promote.</small></div><button class="modal-close" onclick="closeModal()">×</button></div><form class="ops-form" id="rosterEditForm"><div class="form-grid"><div class="form-field"><label>Name</label><input name="name" value="${escapeAttribute(s.name || '')}" required></div><div class="form-field"><label>ID</label><input name="kng_id" value="${escapeAttribute(row.kng_id || '')}"></div><div class="form-field"><label>Discord ID</label><input name="discord_id" value="${escapeAttribute(s.discord_id || row.discord_id || '')}"></div><div class="form-field"><label>Team</label><select name="team"><option value="actions" ${row.team==='actions'?'selected':''}>Actions</option><option value="interactions" ${row.team==='interactions'?'selected':''}>Interactions</option></select></div><div class="form-field"><label>Level</label><select name="hierarchy_level">${['director','manager','adm','aux','ld','sub_ld','member'].map(v=>`<option value="${v}" ${row.hierarchy_level===v?'selected':''}>${escapeHtml(rosterLevelLabel(v,row.team))}</option>`).join('')}</select></div><div class="form-field"><label>Strikes</label><select name="strikes"><option>0</option><option ${row.strikes===1?'selected':''}>1</option><option ${row.strikes===2?'selected':''}>2</option><option ${row.strikes>=3?'selected':''}>3</option></select></div><div class="form-field"><label>Mentor</label><select name="mentor"><option value="false" ${!row.mentor?'selected':''}>N/A</option><option value="true" ${row.mentor?'selected':''}>Mentor</option></select></div><div class="form-field"><label>ALOPA</label><select name="on_alopa"><option value="false" ${!row.on_alopa?'selected':''}>No</option><option value="true" ${row.on_alopa?'selected':''}>Yes</option></select></div><div class="form-field full"><label>Notes</label><textarea name="notes" rows=4>${escapeHtml(row.notes || '')}</textarea></div></div><button class="primary-button">Save Changes</button></form></div>`);
    document.getElementById('rosterEditForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const { error: staffError } = await supabaseClient.from('staff').update({ name: String(data.name).trim(), discord_id: String(data.discord_id || '').trim() || null }).eq('id', row.staff_id);
        if (staffError) return alert(staffError.message);
        const { error } = await supabaseClient.from('entertainment_roster').update({ team: data.team, hierarchy_level: data.hierarchy_level, kng_id: String(data.kng_id || '').trim(), strikes: Number(data.strikes || 0), mentor: data.mentor === 'true', on_alopa: data.on_alopa === 'true', notes: String(data.notes || '').trim(), updated_by: currentUser.id }).eq('id', id);
        if (error) return alert(error.message);
        closeModal(); await loadStaff(); await loadRosterData(); render();
    });
}

function openRosterExportModal() {
    if (!canManage()) return;
    const build = team => {
        const rows = rosterData.filter(r => r.team === team).sort((a,b)=>rosterLevelRank(b.hierarchy_level)-rosterLevelRank(a.hierarchy_level) || String(a.staff?.name||'').localeCompare(String(b.staff?.name||'')));
        const groups = [
            ['adm', 'ADM'],
            ['aux', 'AUX'],
            ['ld', 'LD'],
            ['sub_ld', 'S.LD'],
            ['member', 'MEMBER']
        ];
        const lines = [];
        for (const [level, label] of groups) {
            lines.push(label);
            const members = rows.filter(r => r.hierarchy_level === level);
            if (members.length) {
                members.forEach(r => {
                    const discordId = String(r.staff?.discord_id || r.discord_id || '').trim();
                    lines.push(discordId ? `╰› <@${discordId}>` : '╰› [NO DISCORD ID]');
                });
            } else {
                lines.push('╰›');
            }
            lines.push('');
        }
        const total = rows.filter(r => ['adm', 'aux', 'ld', 'sub_ld', 'member'].includes(r.hierarchy_level)).length;
        lines.push(`${total} members total`);
        return lines.join('\n');
    };
    const output = `**ACTIONS**\n${build('actions') || 'No members allocated.'}\n\n**INTERACTIONS**\n${build('interactions') || 'No members allocated.'}`;
    showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">KNG Discord Output</span><h2>Hierarchy Output</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><textarea id="rosterExportText" class="roster-export" rows=20 readonly>${escapeHtml(output)}</textarea><div class="modal-footer"><button class="secondary-button" onclick="copyRosterOutput()">Copy Output</button><button class="primary-button" onclick="closeModal()">Done</button></div></div>`);
}

async function copyRosterOutput() {
    const text = document.getElementById('rosterExportText')?.value || '';
    try { await navigator.clipboard.writeText(text); alert('Hierarchy output copied.'); } catch (_) { alert(text); }
}

async function saveDailyGoal() {
    if (!isDirector()) return alert('Only a Director can change the daily target.');
    const target = prompt('Daily point target', '8');
    const n = Number(target);
    if (!Number.isFinite(n) || n < 1) return;
    const today = formatDate(new Date());
    const { error } = await supabaseClient.from('ix_daily_goals').upsert({ user_id: currentUser.id, goal_date: today, target_points: Math.floor(n), points_earned: 0 }, { onConflict: 'user_id,goal_date' });
    if (error) {
        if(String(error.message||'').toLowerCase().includes('schema cache') || String(error.message||'').toLowerCase().includes('does not exist')) {
            return showModal(`<div class="modal small-modal"><div class="modal-header"><div><span class="modal-eyebrow">Daily Goals</span><h2>Database setup required</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><p class="modal-message">The Daily Goals table is not installed yet. Run <b>KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql</b> in Supabase, then refresh the site.</p><div class="modal-footer"><button class="primary-button" onclick="closeModal()">Close</button></div></div>`);
        }
        return alert(error.message);
    }
    await loadInteractionData(); render();
}

window.openEventFeedbackModal=openEventFeedbackModal;
window.submitEventFeedback=submitEventFeedback;
window.submitEventSuggestion=submitEventSuggestion;
window.openNewEventSuggestionModal=openNewEventSuggestionModal;
window.submitForumSuggestion=submitForumSuggestion;
window.moderateSuggestion=moderateSuggestion;
window.allocateEntertainmentTeam=allocateEntertainmentTeam;
window.promoteRosterMember=promoteRosterMember;
window.openRosterEditModal=openRosterEditModal;
window.deleteRosterMember=deleteRosterMember;
window.openRosterExportModal=openRosterExportModal;
window.copyRosterOutput=copyRosterOutput;
window.saveDailyGoal=saveDailyGoal;

/* =========================================================
   START
   ========================================================= */

init();
new MutationObserver(()=>{ if(document.getElementById("hofPhotoWindow")) bindHofPhotoControls(); }).observe(document.body,{childList:true,subtree:true});
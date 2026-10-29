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


/* =========================================================
   INITIALISE
   ========================================================= */

async function init() {
    try {
        const { data } = await supabaseClient.auth.getSession();

        currentUser = data?.session?.user || null;

        await loadEventTypes();
        await loadStaff();
        await loadEvents();
        await loadAccess();
        await loadAccessRequests();
        await loadOpsData();

        render();

        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            currentUser = session?.user || null;

            await loadAccess();
            await loadAccessRequests();
            await loadOpsData();
            render();
        });

        setInterval(async () => {
            await loadAccess();
            await loadAccessRequests();
            await loadEvents();
            if (opsView !== "schedule") await loadOpsData();
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

function applyEventVisibility() {
    events = (allEvents || []).filter(e => canManage() || (e.visibility || "public") !== "staff");
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
    if (accessBlock || currentTimeout) {
        renderAccessRestriction();
        return;
    }
    if (opsView !== "schedule") {
        renderOperations();
        return;
    }

    app.innerHTML = `
        <div class="schedule-app">

            <header class="schedule-header">

                <div class="schedule-brand">
                    <div class="schedule-logo">K</div>

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
                class="calendar-day${todayClass}${outsideClass}"
                onclick="handleDateClick('${dateString}')"
            >

                <div class="day-number">
                    ${dayNumber}
                </div>

                <div class="day-events">

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

    const colour =
        event.event_types?.colour || "#3b82f6";

    const type =
        event.event_types?.name || "Event";

    const allocated =
        event.event_staff?.length || 0;

    const required =
        event.staff_required || 0;


    return `
        <div
            class="calendar-event"
            style="--event-colour:${colour}"
            onclick="event.stopPropagation(); openEvent('${event.id}')"
        >

            <span class="event-time">
                ${formatTime(event.start_time)}
            </span>

            <strong>
                ${escapeHtml(event.title)}
            </strong>

            <span class="event-type">
                ${escapeHtml(type)}
            </span>

            ${
                required > 0
                    ? `
                        <span class="event-staff">
                            ${allocated}/${required} staff
                        </span>
                      `
                    : ""
            }

        </div>
    `;
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
                            <button type="button" class="quick-event" onclick="applyEventPreset('Community Meeting')">COMMUNITY MEETING</button>
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

    const visibility = document.getElementById("eventVisibility")?.value || "public";
    const repeat = document.getElementById("eventRepeat")?.value || "none";
    const repeatUntil = document.getElementById("eventRepeatUntil")?.value || eventDate;


    if (endTime <= startTime) {

        errorBox.textContent =
            "End time must be later than start time.";

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

function openEvent(eventId) {

    const event =
        events.find(item => item.id === eventId);

    if (!event) return;

    selectedEvent = event;


    const colour =
        event.event_types?.colour || "#3b82f6";


    const allocations =
        event.event_staff || [];


    showModal(`
        <div class="modal event-detail-modal">

            <div
                class="event-detail-accent"
                style="background:${colour}">
            </div>


            <div class="modal-header">

                <div>

                    <span class="modal-eyebrow">
                        ${escapeHtml(
                            event.event_types?.name || "Event"
                        )}
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


            <div class="event-detail-content">

                <div class="event-detail-row">
                    <span>📅</span>

                    <div>
                        <strong>Date</strong>

                        <p>
                            ${formatDisplayDate(
                                event.event_date
                            )}
                        </p>
                    </div>
                </div>


                <div class="event-detail-row">
                    <span>⏰</span>

                    <div>
                        <strong>Time</strong>

                        <p>
                            ${formatTime(event.start_time)}
                            -
                            ${formatTime(event.end_time)}
                        </p>
                    </div>
                </div>


                ${
                    event.location
                        ? `
                            <div class="event-detail-row">
                                <span>📍</span>

                                <div>
                                    <strong>Location</strong>
                                    <p>
                                        ${escapeHtml(
                                            event.location
                                        )}
                                    </p>
                                </div>
                            </div>
                          `
                        : ""
                }


                ${
                    event.description
                        ? `
                            <div class="event-detail-description">
                                <strong>Description</strong>

                                <p>
                                    ${escapeHtml(
                                        event.description
                                    ).replace(
                                        /\n/g,
                                        "<br>"
                                    )}
                                </p>
                            </div>
                          `
                        : ""
                }


                ${
                    event.staff_required > 0
                        ? `
                            <div class="staff-section">

                                <div class="staff-section-header">

                                    <div>
                                        <strong>
                                            Staff Allocation
                                        </strong>

                                        <span>
                                            ${allocations.length}
                                            /
                                            ${event.staff_required}
                                        </span>
                                    </div>

                                    ${
                                        canManage()
                                            ? `
                                                <button
                                                    class="secondary-button"
                                                    onclick="openStaffAllocation('${event.id}')">
                                                    Manage Staff
                                                </button>
                                              `
                                            : ""
                                    }

                                </div>


                                ${
                                    allocations.length
                                        ? `
                                            <div class="allocated-staff">
                                                ${allocations.map(
                                                    allocation => `
                                                        <div class="staff-chip">
                                                            <span>
                                                                ${escapeHtml(
                                                                    allocation.staff?.name
                                                                    || "Unknown"
                                                                )}
                                                            </span>

                                                            ${
                                                                allocation.role
                                                                    ? `<small>
                                                                        ${escapeHtml(
                                                                            allocation.role
                                                                        )}
                                                                       </small>`
                                                                    : ""
                                                            }
                                                        </div>
                                                    `
                                                ).join("")}
                                            </div>
                                          `
                                        : `
                                            <div class="no-staff">
                                                No staff allocated yet.
                                            </div>
                                          `
                                }

                            </div>
                          `
                        : ""
                }

            </div>


            ${
                canManage()
                    ? `
                        <div class="modal-footer">

                            <button
                                class="danger-button"
                                onclick="deleteEvent('${event.id}')">
                                Delete Event
                            </button>

                            <div class="modal-footer-right">

                                <button
                                    class="secondary-button"
                                    onclick="openEditEvent('${event.id}')">
                                    Edit Event
                                </button>

                                <button
                                    class="primary-button"
                                    onclick="closeModal()">
                                    Done
                                </button>

                            </div>

                        </div>
                      `
                    : `
                        <div class="modal-footer">
                            <button
                                class="primary-button"
                                onclick="closeModal()">
                                Close
                            </button>
                        </div>
                      `
            }

        </div>
    `);
}


/* =========================================================
   EDIT EVENT
   ========================================================= */

function openEditEvent(eventId) {

    const event =
        events.find(item => item.id === eventId);

    if (!event || !canManage()) return;


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
                        <select id="editEventVisibility">
                            <option value="public" ${(event.visibility || "public") === "public" ? "selected" : ""}>Player visible</option>
                            <option value="staff" ${event.visibility === "staff" ? "selected" : ""}>Staff only</option>
                        </select>
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
    const visibility = document.getElementById("editEventVisibility")?.value || "public";


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

async function deleteEvent(eventId) {

    if (!canManage()) return;


    const event =
        events.find(item => item.id === eventId);

    if (!event) return;


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
        ["schedule", "▦", "Schedule", 0],
        ["dashboard", "◈", "Dashboard", 2],
        ["actions", "⚡", "Actions & Interactions", 2],
        ["points", "✣", "Points", 2],
        ["logs", "◎", "Logs", 2],
        ["security", "◉", "Security", 3],
        ["prizes", "◇", "Prizes & Commands", 2]
    ];
    if (canApproveAccess()) items.push(["access", "✓", `Access Requests${pendingCount ? ` (${pendingCount})` : ""}`, 2]);
    const rank = permissionRank();
    const visible = items.filter(([, , , requiredRank]) => rank >= requiredRank);
    return `<aside class="integrated-sidebar" aria-label="KNG navigation">
        <div class="sidebar-section-label">KNG ENTERTAINMENT</div>
        <nav class="integrated-sidebar-nav">
            ${visible.map(([id, icon, label]) => `
                <button class="integrated-nav-btn ${opsView === id ? "active" : ""}" onclick="switchOpsView('${id}')">
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
            <div class="schedule-logo">K</div>
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
    if (view !== "schedule" && !currentUser) {
        showLoginMessage();
        return;
    }
    if (view === "access" && !canApproveAccess()) {
        showLoginMessage();
        return;
    }
    opsView = view;
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
}

function opsCard(title, body, extra="") {
    return `<section class="ops-card"><div class="ops-card-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
}

function opsErrorNotice(name) {
    const err = opsLoadErrors[name];
    if (!err) return "";
    return `<div class="ops-notice warning">${escapeHtml(name)} is not connected yet. Run <code>kng_schedule_operations.sql</code> in Supabase. <small>${escapeHtml(err)}</small></div>`;
}

function renderOperations() {
    if (opsView === "schedule") { render(); return; }
    if (opsView === "access" && !canApproveAccess()) { showLoginMessage(); return; }
    const titles = {
        dashboard: ["KNG Entertainment Dashboard", "Events, completions and staff operations"],
        actions: ["Actions & Interactions", "Tracker, hungry pool, reductions and helpers"],
        tracker: ["Tracker", "Track staff activity and operational work"],
        points: ["Points", "Staff points, adjustments and leaderboard"],
        hungry: ["Hungry Pool", "Open operational slots and availability"],
        reductions: ["Reductions", "Track staff reductions and reasons"],
        logs: ["Logs", "Audit trail of operational changes"],
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
        case "actions": return renderOpsActionsHub();
        case "tracker": return renderOpsTracker();
        case "points": return renderOpsPoints();
        case "hungry": return renderOpsHungry();
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
    const todayEvents = events.filter(e => e.event_date === today);
    const completed = (allEvents || []).filter(isEventCompleted);
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
            <button class="hub-action" onclick="switchOpsView('hungry')"><b>Hungry Pool</b><small>Open operational slots</small></button>
            <button class="hub-action" onclick="switchOpsView('reductions')"><b>Reductions</b><small>Record staff reductions</small></button>
            <button class="hub-action" onclick="switchOpsView('helpers')"><b>Helpers</b><small>Assign event helpers</small></button>
        </div>`)}
        ${opsCard("Quick actions", `<div class="action-hub-grid">
            <button class="hub-action" onclick="openCreateEventModal()"><b>Create Event</b><small>Party, Event, Battle Royale or Community Meeting</small></button>
            <button class="hub-action" onclick="openPrizeWinModal()"><b>Prize Win</b><small>Record a winner and generate their command</small></button>
            <button class="hub-action" onclick="switchOpsView('logs')"><b>Log Events</b><small>See every operational change</small></button>
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

function renderOpsHungry() {
    return `${opsErrorNotice("hungry")}
        <div class="ops-grid-two">
            ${canManage() ? opsCard("Add to hungry pool", `<form id="hungryForm" class="ops-form"><input name="event_date" type="date" value="${formatDate(new Date())}" required><input name="event_time" type="time" required><input name="title" maxlength="120" placeholder="Slot title" required><input name="department" maxlength="80" placeholder="Department"><textarea name="notes" rows="3" placeholder="Notes"></textarea><button class="primary-button">Add entry</button></form>`) : ""}
            ${opsCard("Open pool", ops.hungry.length ? `<div class="ops-list">${ops.hungry.map(x=>`<div class="ops-row"><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.event_date)} · ${escapeHtml(x.event_time || "")} · ${escapeHtml(x.department || "")}</small></div>${canManage()?`<button class="danger-button ops-delete-hungry" data-id="${x.id}">Remove</button>`:""}</div>`).join("")}</div>` : `<div class="ops-empty">The pool is empty.</div>`)}
        </div>`;
}

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
            ${canManage() ? opsCard("Crashout timeout", `<form id="timeoutForm" class="ops-form"><textarea name="emails" rows="5" placeholder="user1@example.com\nuser2@example.com\nuser3@example.com" required></textarea><input name="minutes" type="number" min="1" max="10080" value="30" required><input name="reason" maxlength="200" placeholder="Reason" required><button class="danger-button">Timeout everyone</button><small>Multiple emails can be supplied, one per line. Access is automatically restored after the timeout expires.</small></form>`) : ""}
            ${canManage() ? opsCard("Kick off / remove from team", `<form id="blockForm" class="ops-form"><textarea name="emails" rows="5" placeholder="staff@example.com\nformerstaff@example.com" required></textarea><input name="reason" maxlength="200" placeholder="Reason" required><button class="danger-button">Kick off &amp; block access</button><small>This blocks website access for the supplied accounts until a manager removes the block.</small></form>`) : ""}
        </div>
        ${opsCard("Active timeouts", (ops.timeouts||[]).length ? `<div class="ops-list">${ops.timeouts.filter(t=>new Date(t.expires_at)>new Date()).map(t=>`<div class="ops-row"><div><b>${escapeHtml(t.email)}</b><small>${escapeHtml(t.reason||"")} · until ${formatOpsDateTime(t.expires_at)}</small></div><span class="ops-pill">Timed out</span></div>`).join("")}</div>` : `<div class="ops-empty">No active timeouts.</div>`)}
        ${opsCard("Blocked accounts", (ops.blocks||[]).length ? `<div class="ops-list">${ops.blocks.map(b=>`<div class="ops-row"><div><b>${escapeHtml(b.email)}</b><small>${escapeHtml(b.reason||"")} · ${formatOpsDateTime(b.created_at)}</small></div><button class="secondary-button unblock-account" data-email="${escapeAttribute(b.email)}">Unblock</button></div>`).join("")}</div>` : `<div class="ops-empty">No blocked accounts.</div>`)}
        ${opsCard("Security & audit events", combined.length ? `<div class="ops-list">${combined.slice(0,100).map(x=>`<details class="audit-item"><summary><b>${escapeHtml(x._kind)} · ${escapeHtml(x.event_type || x.action || "Event")}</b><span>${escapeHtml(x.actor_name||"System")} · ${formatOpsDateTime(x.created_at)}</span></summary><pre>${escapeHtml(JSON.stringify(x.details||{},null,2))}</pre></details>`).join("")}</div>` : `<div class="ops-empty">No security events recorded.</div>`)}
    `;
}

function renderOpsPrizes() {
    const wins = ops.prizeWins || [];
    return `${opsErrorNotice("prizes")}
        <div class="ops-toolbar prize-tabs">
            <button class="integrated-nav-btn active" onclick="openPrizeWinModal()">🏆 Prize Win</button>
            <button class="integrated-nav-btn" onclick="document.getElementById('commandVault')?.scrollIntoView({behavior:'smooth'})">⌘ Commands</button>
        </div>
        <div class="ops-grid-two">
            ${canManage() ? opsCard("Prize catalogue", `<form id="prizeForm" class="ops-form"><input name="label" maxlength="100" placeholder="Prize name" required><input name="code" maxlength="80" placeholder="Item code" required><input name="amount" type="number" min="1" required placeholder="Amount"><input name="command_template" maxlength="300" placeholder="Command template, e.g. /giveitem {discord_id} {code} {amount}" value="/giveitem {discord_id} {code} {amount}"><button class="primary-button">Add prize</button><small>Placeholders: {discord_id}, {name}, {code}, {amount}</small></form>`) : ""}
            ${opsCard("Prize catalogue", ops.prizes.length ? `<div class="prize-grid">${ops.prizes.map(p=>`<div class="prize-card"><span>${escapeHtml(p.label)}</span><b>${escapeHtml(p.code)}</b><strong>${Number(p.amount||0)}</strong><small>${escapeHtml(p.command_template || "")}</small></div>`).join("")}</div>` : `<div class="ops-empty">No prizes configured yet.</div>`)}
        </div>
        <div id="commandVault">${opsCard("Prize wins & command vault", wins.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Winner</th><th>Prize</th><th>Command</th><th>Won</th><th></th></tr></thead><tbody>${wins.map(w=>`<tr><td>${escapeHtml(w.recipient_name || "Unknown")}</td><td>${escapeHtml(w.ops_prizes?.label || "Prize")}</td><td><code class="command-code">${escapeHtml(w.command || "")}</code></td><td>${formatOpsDateTime(w.created_at)}</td><td><button class="secondary-button copy-command" data-command="${escapeAttribute(w.command || "")}">Copy</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="ops-empty">No prize wins recorded yet.</div>`)}</div>`;
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
    document.getElementById("hungryForm")?.addEventListener("submit", submitHungry);
    document.getElementById("reductionForm")?.addEventListener("submit", submitReduction);
    document.getElementById("prizeForm")?.addEventListener("submit", submitPrize);
    document.getElementById("helperForm")?.addEventListener("submit", submitHelper);
    document.getElementById("timeoutForm")?.addEventListener("submit", submitTimeout);
    document.getElementById("blockForm")?.addEventListener("submit", submitBlock);
    document.querySelectorAll(".copy-command").forEach(btn => btn.addEventListener("click", () => copyCommand(btn.dataset.command, btn)));
    document.querySelectorAll(".unblock-account").forEach(btn => btn.addEventListener("click", () => unblockAccount(btn.dataset.email)));
    document.querySelectorAll(".ops-delete-hungry").forEach(btn => btn.addEventListener("click", () => deleteHungry(btn.dataset.id)));
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

async function submitBlock(e) {
    e.preventDefault();
    if (!canManage()) return;
    const data = new FormData(e.target);
    const emails = String(data.get("emails") || "").split(/\s*[\n,;]\s*/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    const reason = String(data.get("reason") || "").trim();
    if (!emails.length) return;
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

async function openPrizeWinModal() {
    if (!canManage()) return showLoginMessage();
    const prizes = ops.prizes || [];
    showModal(`<div class="modal"><div class="modal-header"><div><span class="modal-eyebrow">Prize Win</span><h2>Record Prize Win</h2></div><button class="modal-close" onclick="closeModal()">×</button></div><form id="prizeWinForm" class="ops-form"><input name="recipient_name" maxlength="100" placeholder="Winner name" required><input name="discord_id" maxlength="50" placeholder="Discord / in-game ID" required><select name="prize_id" required><option value="">Select prize</option>${prizes.map(p=>`<option value="${p.id}">${escapeHtml(p.label)} · ${escapeHtml(p.code)} · ${Number(p.amount||0)}</option>`).join("")}</select><div class="command-preview" id="commandPreview">Select a prize to generate the command.</div><button class="primary-button">Record Win &amp; Generate Command</button></form></div>`);
    document.getElementById("prizeWinForm")?.addEventListener("change", updatePrizeCommandPreview);
    document.getElementById("prizeWinForm")?.addEventListener("input", updatePrizeCommandPreview);
    document.getElementById("prizeWinForm")?.addEventListener("submit", submitPrizeWin);
}

function buildPrizeCommand(prize, name, discordId) {
    const template = prize?.command_template || "/giveitem {discord_id} {code} {amount}";
    return template.replaceAll("{discord_id}", discordId).replaceAll("{name}", name).replaceAll("{code}", prize?.code || "").replaceAll("{amount}", String(prize?.amount || 0));
}

function updatePrizeCommandPreview() {
    const f = document.getElementById("prizeWinForm");
    if (!f) return;
    const prize = ops.prizes.find(p=>p.id === f.prize_id.value);
    const command = buildPrizeCommand(prize, f.recipient_name.value.trim(), f.discord_id.value.trim());
    const box = document.getElementById("commandPreview");
    if (box) box.textContent = command;
}

async function submitPrizeWin(e) {
    e.preventDefault();
    if (!canManage()) return;
    const data = new FormData(e.target);
    const recipient_name = String(data.get("recipient_name") || "").trim();
    const discord_id = String(data.get("discord_id") || "").trim();
    const prize_id = String(data.get("prize_id") || "");
    const prize = ops.prizes.find(p=>p.id === prize_id);
    if (!prize) return alert("Select a prize.");
    const command = buildPrizeCommand(prize, recipient_name, discord_id);
    const payload = { prize_id, recipient_name, discord_id, amount: Number(prize.amount || 0), command, won_by: currentUser.id };
    const { error } = await supabaseClient.from("ops_prize_wins").insert(payload);
    if (error) return alert(error.message);
    await writeAudit("prize.won", payload);
    closeModal(); await loadOpsData(); render();
}

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
    if (event.status === "completed") return true;
    if (!event.event_date || !event.end_time) return false;
    return new Date(`${event.event_date}T${event.end_time}`) < new Date();
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
    app.innerHTML = `<div class="schedule-app"><main class="restricted-screen"><div class="restricted-card"><div class="schedule-logo">K</div><h1>${blocked ? "Access Removed" : "Temporarily Timed Out"}</h1><p>${blocked ? `Your KNG Entertainment access has been removed from the team.` : `Your access is temporarily unavailable until ${formatOpsDateTime(timeout?.expires_at)}.`}</p><small>${escapeHtml((blocked?.reason || timeout?.reason || "Contact management."))}</small><button class="header-button" onclick="logout()">Sign Out</button></div></main></div>`;
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
window.openPrizeWinModal = openPrizeWinModal;
window.copyCommand = copyCommand;


/* =========================================================
   START
   ========================================================= */

init();
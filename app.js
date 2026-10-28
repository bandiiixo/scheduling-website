/* =========================================================
   KNG SCHEDULE
   ========================================================= */

const app = document.getElementById("app");

let currentDate = new Date();
let currentView = "month";
let events = [];
let eventTypes = [];
let staff = [];
let currentUser = null;
let currentAccess = null;
let selectedEvent = null;


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

        render();

        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            currentUser = session?.user || null;

            await loadAccess();
            render();
        });

        await loadAccess();

        setInterval(async () => {
            await loadEvents();
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

    events = data || [];
}


async function loadAccess() {
    currentAccess = null;

    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from("staff_access")
        .select("access_level, active")
        .eq("user_id", currentUser.id)
        .eq("active", true)
        .maybeSingle();

    if (error) {
        console.error("Access check failed:", error);
        return;
    }

    currentAccess = data || null;
}


function canManage() {
    return currentAccess &&
        ["manager", "admin"].includes(currentAccess.access_level);
}


function isAdmin() {
    return currentAccess?.access_level === "admin";
}


/* =========================================================
   RENDER
   ========================================================= */

function render() {
    app.innerHTML = `
        <div class="schedule-app">

            <header class="schedule-header">

                <div class="schedule-brand">
                    <div class="schedule-logo"><img src="city-logo-mark.png" alt="City logo"></div>

                    <div>
                        <h1>KNG Schedule</h1>
                        <span>Events &amp; Staff Planning</span>
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
                    PLAYER VIEW
                </span>

                <button class="header-button"
                    onclick="openLogin()">
                    Staff Login
                </button>
              `
    }

    <button class="header-button"
        onclick="goToday()">
        Today
    </button>

</div>

            </header>


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
    const dayEvents = events
        .filter(event => event.event_date === dateString)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

    let html = `
        <div class="day-calendar">

            <div class="day-header">
                <div>
                    <span class="day-header-label">Daily Schedule</span>
                    <strong>
                        ${currentDate.toLocaleDateString("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long"
                        })}
                    </strong>
                </div>

                <span class="day-header-hint">
                    ${canManage() ? "Click an hour to create an event" : "Select an event to view its details"}
                </span>
            </div>

            <div class="day-timeline">
                <div class="day-hours">
    `;

    for (let hour = 0; hour < 24; hour++) {
        html += `
            <div
                class="day-row"
                onclick="handleDateClick('${dateString}', ${hour})"
            >
                <div class="time-label">
                    ${String(hour).padStart(2, "0")}:00
                </div>
                <div class="day-cell"></div>
            </div>
        `;
    }

    html += `
                </div>

                <div class="day-events-layer">
                    ${dayEvents.map(event => renderDayTimelineEvent(event)).join("")}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderDayTimelineEvent(event) {
    const colour = event.event_types?.colour || "#d1002f";
    const allocated = event.event_staff?.length || 0;
    const required = event.staff_required || 0;

    const startMinutes = timeToMinutes(event.start_time);
    const endMinutes = timeToMinutes(event.end_time);
    const duration = Math.max(endMinutes - startMinutes, 30);

    const top = (startMinutes / 60) * 72;
    const height = Math.max((duration / 60) * 72 - 4, 48);

    return `
        <div
            class="day-timeline-event"
            style="--event-colour:${colour}; top:${top}px; height:${height}px"
            onclick="event.stopPropagation(); openEvent('${event.id}')"
        >
            <div class="day-event-time">
                ${formatTime(event.start_time)} - ${formatTime(event.end_time)}
            </div>
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(event.event_types?.name || "Event")}</span>
            ${required > 0 ? `<span>${allocated}/${required} staff</span>` : ""}
        </div>
    `;
}

function timeToMinutes(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
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
                        New Event
                    </span>

                    <h2>Create Event</h2>
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
                            placeholder="e.g. Legion BR"
                        >
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


    if (endTime <= startTime) {

        errorBox.textContent =
            "End time must be later than start time.";

        return;
    }


    const { error } = await supabaseClient
        .from("events")
        .insert({
            title,
            event_type_id: eventTypeId,
            event_date: eventDate,
            start_time: startTime,
            end_time: endTime,
            location: location || null,
            description: description || null,
            staff_required: staffRequired,
            created_by: currentUser?.id || null,
            updated_by: currentUser?.id || null
        });


    if (error) {

        errorBox.textContent = error.message;

        return;
    }


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
            updated_by: currentUser?.id || null
        })
        .eq("id", eventId);


    if (error) {

        errorBox.textContent = error.message;

        return;
    }


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
    // detailed hour-by-hour day view. Clicking an hour from the
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
                Viewing the schedule is public, but creating
                and managing events requires staff access.
            </p>

            <div class="modal-footer">

                <button
                    class="primary-button"
                    onclick="openLogin()">
                    Staff Login
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
        <div class="modal small-modal">

            <div class="modal-header">

                <div>
                    <span class="modal-eyebrow">
                        KNG Schedule
                    </span>

                    <h2>Staff Login</h2>
                </div>

                <button
                    class="modal-close"
                    onclick="closeModal()">
                    ×
                </button>

            </div>


            <form onsubmit="login(event)">

                <div class="form-field">
                    <label>Email</label>

                    <input
                        id="loginEmail"
                        type="email"
                        autocomplete="email"
                        required
                    >
                </div>


                <div class="form-field">
                    <label>Password</label>

                    <input
                        id="loginPassword"
                        type="password"
                        autocomplete="current-password"
                        required
                    >
                </div>


                <div id="loginError"
                    class="form-error">
                </div>


                <div class="modal-footer">

                    <button
                        type="submit"
                        class="primary-button">
                        Sign In
                    </button>

                </div>

            </form>

        </div>
    `);
}


async function login(event) {

    event.preventDefault();


    const email =
        document.getElementById(
            "loginEmail"
        ).value.trim();


    const password =
        document.getElementById(
            "loginPassword"
        ).value;


    const errorBox =
        document.getElementById(
            "loginError"
        );


    errorBox.textContent = "";


    const { error } =
        await supabaseClient.auth
            .signInWithPassword({
                email,
                password
            });


    if (error) {

        errorBox.textContent =
            error.message;

        return;
    }


    closeModal();

    await loadAccess();

    render();
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

window.login =
    login;


/* =========================================================
   START
   ========================================================= */

init();

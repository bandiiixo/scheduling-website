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
   INITIALISATION
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

    if (error) {
        console.error(error);
        return;
    }

    eventTypes = data || [];
}


async function loadStaff() {
    const { data, error } = await supabaseClient
        .from("staff")
        .select("*")
        .eq("active", true)
        .order("name");

    if (error) {
        console.error(error);
        return;
    }

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
                colour
            ),
            event_staff (
                id,
                staff_id,
                staff (
                    id,
                    name,
                    active
                )
            )
        `)
        .order("start_time", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    events = data || [];
}


async function loadAccess() {
    currentAccess = null;

    if (!currentUser) {
        return;
    }

    const { data, error } = await supabaseClient
        .from("staff_access")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        return;
    }

    currentAccess = data || null;
}


/* =========================================================
   PERMISSIONS
   ========================================================= */

function canManage() {
    if (!currentUser || !currentAccess) {
        return false;
    }

    return (
        currentAccess.role === "manager" ||
        currentAccess.role === "admin"
    );
}


function isAdmin() {
    return (
        currentUser &&
        currentAccess &&
        currentAccess.role === "admin"
    );
}


/* =========================================================
   MAIN RENDER
   ========================================================= */

function render() {

    app.innerHTML = `
        <div class="schedule-app">

            <header class="schedule-header">

                <div class="schedule-brand">

                    <div class="schedule-logo">
                        <img src="city-logo-mark.png" alt="KNG">
                    </div>

                    <div>
                        <h1>KNG Schedule</h1>
                        <p>Events & Staff Planning</p>
                    </div>

                </div>

                <div class="schedule-header-actions">

                    ${
                        canManage()
                            ? `
                                <span class="access-badge management">
                                    STAFF MODE
                                </span>

                                <button
                                    class="primary-button"
                                    onclick="openCreateEventModal()"
                                >
                                    + Create Event
                                </button>

                                <button
                                    class="secondary-button"
                                    onclick="logout()"
                                >
                                    Logout
                                </button>
                              `
                            : `
                                <span class="access-badge player">
                                    PLAYER VIEW
                                </span>

                                ${
                                    currentUser
                                        ? `
                                            <button
                                                class="secondary-button"
                                                onclick="logout()"
                                            >
                                                Logout
                                            </button>
                                          `
                                        : `
                                            <button
                                                class="secondary-button"
                                                onclick="openLoginModal()"
                                            >
                                                Staff Login
                                            </button>
                                          `
                                }
                              `
                    }

                </div>

            </header>


            <main class="schedule-main">

                <section class="calendar-toolbar">

                    <div class="calendar-navigation">

                        <button
                            class="icon-button"
                            onclick="previousPeriod()"
                            aria-label="Previous"
                        >
                            ‹
                        </button>

                        <button
                            class="today-button"
                            onclick="goToday()"
                        >
                            Today
                        </button>

                        <button
                            class="icon-button"
                            onclick="nextPeriod()"
                            aria-label="Next"
                        >
                            ›
                        </button>

                        <h2>
                            ${getCalendarTitle()}
                        </h2>

                    </div>


                    <div class="view-switcher">

                        <button
                            class="${currentView === "month" ? "active" : ""}"
                            onclick="setView('month')"
                        >
                            Month
                        </button>

                        <button
                            class="${currentView === "week" ? "active" : ""}"
                            onclick="setView('week')"
                        >
                            Week
                        </button>

                        <button
                            class="${currentView === "day" ? "active" : ""}"
                            onclick="setView('day')"
                        >
                            Day
                        </button>

                        <button
                            class="${currentView === "agenda" ? "active" : ""}"
                            onclick="setView('agenda')"
                        >
                            Agenda
                        </button>

                    </div>

                </section>


                <section class="calendar-container">

                    ${
                        currentView === "month"
                            ? renderMonthView()
                            : currentView === "week"
                                ? renderWeekView()
                                : currentView === "day"
                                    ? renderDayView()
                                    : renderAgendaView()
                    }

                </section>

            </main>

        </div>
    `;
}


/* =========================================================
   CALENDAR TITLES
   ========================================================= */

function getCalendarTitle() {

    if (currentView === "month") {

        return currentDate.toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric"
        });

    }

    if (currentView === "week") {

        const start = startOfWeek(currentDate);

        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        const startText = start.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short"
        });

        const endText = end.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });

        return `${startText} - ${endText}`;
    }

    if (currentView === "day") {

        return currentDate.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

    }

    return "Agenda";
}


/* =========================================================
   MONTH VIEW
   ========================================================= */

function renderMonthView() {

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);

    let startingDay = firstDay.getDay();

    if (startingDay === 0) {
        startingDay = 7;
    }

    startingDay -= 1;

    const daysInMonth = new Date(
        year,
        month + 1,
        0
    ).getDate();

    const previousMonthDays = new Date(
        year,
        month,
        0
    ).getDate();

    let cells = "";

    for (let i = 0; i < 42; i++) {

        let dayNumber;
        let cellDate;
        let isCurrentMonth = true;

        if (i < startingDay) {

            dayNumber =
                previousMonthDays -
                startingDay +
                i +
                1;

            cellDate = new Date(
                year,
                month - 1,
                dayNumber
            );

            isCurrentMonth = false;

        } else if (
            i >= startingDay + daysInMonth
        ) {

            dayNumber =
                i -
                startingDay -
                daysInMonth +
                1;

            cellDate = new Date(
                year,
                month + 1,
                dayNumber
            );

            isCurrentMonth = false;

        } else {

            dayNumber =
                i -
                startingDay +
                1;

            cellDate = new Date(
                year,
                month,
                dayNumber
            );
        }

        const dateString =
            toDateInputValue(cellDate);

        const dayEvents =
            events.filter(event => {
                return event.start_time?.startsWith(
                    dateString
                );
            });

        cells += `
            <div
                class="
                    month-cell
                    ${isCurrentMonth ? "" : "outside-month"}
                    ${isToday(cellDate) ? "today" : ""}
                "
                onclick="handleDateClick('${dateString}')"
            >

                <div class="month-cell-header">

                    <span class="month-day-number">
                        ${dayNumber}
                    </span>

                </div>

                <div class="month-events">

                    ${
                        dayEvents
                            .slice(0, 4)
                            .map(renderCalendarEvent)
                            .join("")
                    }

                    ${
                        dayEvents.length > 4
                            ? `
                                <div class="more-events">
                                    +${dayEvents.length - 4} more
                                </div>
                              `
                            : ""
                    }

                </div>

            </div>
        `;
    }

    return `
        <div class="month-calendar">

            <div class="weekday-row">

                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
                <div>Sun</div>

            </div>

            <div class="month-grid">
                ${cells}
            </div>

        </div>
    `;
}


/* =========================================================
   WEEK VIEW
   ========================================================= */

function renderWeekView() {

    const weekStart = startOfWeek(currentDate);

    const days = [];

    for (let i = 0; i < 7; i++) {

        const day = new Date(weekStart);

        day.setDate(
            weekStart.getDate() + i
        );

        days.push(day);
    }

    let html = `
        <div class="week-calendar">

            <div class="week-header">

                <div class="time-column-header"></div>
    `;

    days.forEach(day => {

        html += `
            <div
                class="
                    week-day-header
                    ${isToday(day) ? "today" : ""}
                "
            >

                <span class="week-day-name">
                    ${day.toLocaleDateString("en-GB", {
                        weekday: "short"
                    })}
                </span>

                <span class="week-day-number">
                    ${day.getDate()}
                </span>

            </div>
        `;

    });

    html += `
            </div>

            <div class="week-body">
    `;

    for (let hour = 0; hour < 24; hour++) {

        html += `
            <div class="week-row">

                <div class="time-label">
                    ${formatHour(hour)}
                </div>
        `;

        days.forEach(day => {

            const dateString =
                toDateInputValue(day);

            const hourEvents =
                events.filter(event => {

                    if (
                        !event.start_time ||
                        !event.start_time.startsWith(
                            dateString
                        )
                    ) {
                        return false;
                    }

                    const start =
                        new Date(event.start_time);

                    return start.getHours() === hour;
                });

            html += `
                <div
                    class="week-hour-cell"
                    onclick="handleDateClick(
                        '${dateString}',
                        ${hour}
                    )"
                >

                    ${
                        hourEvents
                            .map(renderCalendarEvent)
                            .join("")
                    }

                </div>
            `;

        });

        html += `
            </div>
        `;
    }

    html += `
            </div>

        </div>
    `;

    return html;
}


/* =========================================================
   DAY VIEW
   ========================================================= */

function renderDayView() {

    const dateString =
        toDateInputValue(currentDate);

    let html = `
        <div class="day-calendar">

            <div class="day-header">

                <div class="day-time-header">
                    Time
                </div>

                <div
                    class="
                        day-date-header
                        ${isToday(currentDate) ? "today" : ""}
                    "
                >

                    ${currentDate.toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long"
                    })}

                </div>

            </div>

            <div class="day-body">
    `;

    for (let hour = 0; hour < 24; hour++) {

        const hourEvents =
            events.filter(event => {

                if (
                    !event.start_time ||
                    !event.start_time.startsWith(
                        dateString
                    )
                ) {
                    return false;
                }

                const start =
                    new Date(event.start_time);

                return start.getHours() === hour;
            });

        html += `
            <div class="day-row">

                <div class="time-label">
                    ${formatHour(hour)}
                </div>

                <div
                    class="day-hour-cell"
                    onclick="handleDateClick(
                        '${dateString}',
                        ${hour}
                    )"
                >

                    ${
                        hourEvents
                            .map(renderCalendarEvent)
                            .join("")
                    }

                </div>

            </div>
        `;
    }

    html += `
            </div>

        </div>
    `;

    return html;
}


/* =========================================================
   CALENDAR EVENT
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


/* =========================================================
   AGENDA VIEW
   ========================================================= */

function renderAgendaView() {

    const sortedEvents =
        [...events].sort(
            (a, b) =>
                new Date(a.start_time) -
                new Date(b.start_time)
        );

    if (!sortedEvents.length) {

        return `
            <div class="agenda-empty">
                <h3>No events scheduled</h3>
                <p>
                    There are currently no events
                    in the schedule.
                </p>
            </div>
        `;
    }

    let html = `
        <div class="agenda-view">
    `;

    let lastDate = null;

    sortedEvents.forEach(event => {

        const eventDate =
            event.start_time?.slice(0, 10);

        if (eventDate !== lastDate) {

            lastDate = eventDate;

            html += `
                <div class="agenda-date">
                    ${formatDisplayDate(eventDate)}
                </div>
            `;
        }

        const type =
            event.event_types?.name || "Event";

        const colour =
            event.event_types?.colour || "#3b82f6";

        const allocated =
            event.event_staff?.length || 0;

        const required =
            event.staff_required || 0;

        html += `
            <div
                class="agenda-event"
                onclick="openEvent('${event.id}')"
                style="--event-colour:${colour}"
            >

                <div class="agenda-event-time">
                    ${formatTime(event.start_time)}
                    -
                    ${formatTime(event.end_time)}
                </div>

                <div class="agenda-event-main">

                    <strong>
                        ${escapeHtml(event.title)}
                    </strong>

                    <span>
                        ${escapeHtml(type)}
                    </span>

                </div>

                <div class="agenda-event-location">
                    ${
                        event.location
                            ? escapeHtml(event.location)
                            : ""
                    }
                </div>

                ${
                    required > 0
                        ? `
                            <div class="agenda-event-staff">
                                ${allocated}/${required}
                            </div>
                          `
                        : ""
                }

            </div>
        `;
    });

    html += `
        </div>
    `;

    return html;
}
/* =========================================================
   EVENT CLICK / CREATION
   ========================================================= */

function handleDateClick(date, hour = null) {

    // Clicking a date from the month view opens that date
    // in the detailed hour-by-hour Day view.
    // Clicking an hour from the day/week view can create
    // an event when Management is signed in.

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
   CREATE EVENT MODAL
   ========================================================= */

function openCreateEventModal(
    date = null,
    hour = null
) {

    if (!canManage()) {
        return;
    }

    const selectedDate =
        date ||
        toDateInputValue(currentDate);

    const startHour =
        hour !== null
            ? hour
            : 19;

    const endHour =
        hour !== null
            ? Math.min(hour + 1, 23)
            : 20;

    const startTime =
        `${String(startHour).padStart(2, "0")}:00`;

    const endTime =
        `${String(endHour).padStart(2, "0")}:00`;

    const typeOptions =
        eventTypes
            .map(type => `
                <option value="${type.id}">
                    ${escapeHtml(type.name)}
                </option>
            `)
            .join("");

    showModal(`
        <div class="modal-header">

            <div>
                <h2>Create Event</h2>
                <p>
                    Add a new event to the KNG schedule.
                </p>
            </div>

            <button
                class="modal-close"
                onclick="closeModal()"
            >
                ×
            </button>

        </div>


        <form
            class="modal-form"
            onsubmit="createEvent(event)"
        >

            <div class="form-group">

                <label for="event-title">
                    Event Title
                </label>

                <input
                    id="event-title"
                    name="title"
                    type="text"
                    required
                    maxlength="150"
                    placeholder="Enter event title"
                >

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label for="event-type">
                        Event Type
                    </label>

                    <select
                        id="event-type"
                        name="event_type_id"
                        required
                    >

                        <option value="">
                            Select event type
                        </option>

                        ${typeOptions}

                    </select>

                </div>


                <div class="form-group">

                    <label for="event-date">
                        Date
                    </label>

                    <input
                        id="event-date"
                        name="date"
                        type="date"
                        required
                        value="${escapeAttribute(selectedDate)}"
                    >

                </div>

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label for="event-start">
                        Start Time
                    </label>

                    <input
                        id="event-start"
                        name="start"
                        type="time"
                        required
                        value="${startTime}"
                    >

                </div>


                <div class="form-group">

                    <label for="event-end">
                        End Time
                    </label>

                    <input
                        id="event-end"
                        name="end"
                        type="time"
                        required
                        value="${endTime}"
                    >

                </div>

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label for="event-location">
                        Location
                    </label>

                    <input
                        id="event-location"
                        name="location"
                        type="text"
                        maxlength="200"
                        placeholder="Event location"
                    >

                </div>


                <div class="form-group">

                    <label for="event-staff-required">
                        Staff Required
                    </label>

                    <input
                        id="event-staff-required"
                        name="staff_required"
                        type="number"
                        min="0"
                        max="100"
                        value="0"
                    >

                </div>

            </div>


            <div class="form-group">

                <label for="event-description">
                    Description
                </label>

                <textarea
                    id="event-description"
                    name="description"
                    rows="5"
                    maxlength="2000"
                    placeholder="Add any useful event information..."
                ></textarea>

            </div>


            <div class="modal-actions">

                <button
                    type="button"
                    class="secondary-button"
                    onclick="closeModal()"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    class="primary-button"
                >
                    Create Event
                </button>

            </div>

        </form>
    `);
}


/* =========================================================
   CREATE EVENT
   ========================================================= */

async function createEvent(formEvent) {

    formEvent.preventDefault();

    if (!canManage()) {
        return;
    }

    const form =
        formEvent.target;

    const title =
        form.title.value.trim();

    const eventTypeId =
        form.event_type_id.value;

    const date =
        form.date.value;

    const start =
        form.start.value;

    const end =
        form.end.value;

    const location =
        form.location.value.trim();

    const description =
        form.description.value.trim();

    const staffRequired =
        Number(form.staff_required.value || 0);

    if (!title) {
        alert("Please enter an event title.");
        return;
    }

    if (!eventTypeId) {
        alert("Please select an event type.");
        return;
    }

    if (!date || !start || !end) {
        alert("Please provide a date and time.");
        return;
    }

    if (end <= start) {
        alert("The end time must be after the start time.");
        return;
    }

    const startDateTime =
        `${date}T${start}:00`;

    const endDateTime =
        `${date}T${end}:00`;

    const { data, error } =
        await supabaseClient
            .from("events")
            .insert({
                title,
                event_type_id: eventTypeId,
                start_time: startDateTime,
                end_time: endDateTime,
                location:
                    location || null,
                description:
                    description || null,
                staff_required:
                    staffRequired
            })
            .select()
            .single();

    if (error) {

        console.error(error);

        alert(
            error.message ||
            "Unable to create event."
        );

        return;
    }

    closeModal();

    await loadEvents();

    render();
}


/* =========================================================
   OPEN EVENT
   ========================================================= */

function openEvent(eventId) {

    const event =
        events.find(
            item => item.id === eventId
        );

    if (!event) {
        return;
    }

    selectedEvent = event;

    const type =
        event.event_types?.name ||
        "Event";

    const colour =
        event.event_types?.colour ||
        "#3b82f6";

    const allocatedStaff =
        event.event_staff || [];

    const allocated =
        allocatedStaff.length;

    const required =
        event.staff_required || 0;

    const staffHtml =
        allocatedStaff.length
            ? allocatedStaff
                .map(item => `
                    <div class="allocated-staff">
                        ${escapeHtml(
                            item.staff?.name ||
                            "Unknown Staff"
                        )}
                    </div>
                `)
                .join("")
            : `
                <div class="no-staff">
                    No staff allocated
                </div>
              `;

    showModal(`
        <div class="modal-header">

            <div>

                <span
                    class="event-type-badge"
                    style="--event-colour:${colour}"
                >
                    ${escapeHtml(type)}
                </span>

                <h2>
                    ${escapeHtml(event.title)}
                </h2>

            </div>

            <button
                class="modal-close"
                onclick="closeModal()"
            >
                ×
            </button>

        </div>


        <div class="event-details">

            <div class="event-detail-row">

                <span class="detail-label">
                    Date
                </span>

                <span class="detail-value">
                    ${formatDisplayDate(
                        event.start_time?.slice(0, 10)
                    )}
                </span>

            </div>


            <div class="event-detail-row">

                <span class="detail-label">
                    Time
                </span>

                <span class="detail-value">
                    ${formatTime(event.start_time)}
                    -
                    ${formatTime(event.end_time)}
                </span>

            </div>


            ${
                event.location
                    ? `
                        <div class="event-detail-row">

                            <span class="detail-label">
                                Location
                            </span>

                            <span class="detail-value">
                                ${escapeHtml(
                                    event.location
                                )}
                            </span>

                        </div>
                      `
                    : ""
            }


            ${
                event.description
                    ? `
                        <div class="event-detail-description">

                            <span class="detail-label">
                                Description
                            </span>

                            <p>
                                ${escapeHtml(
                                    event.description
                                )}
                            </p>

                        </div>
                      `
                    : ""
            }


            <div class="event-staff-section">

                <div class="event-staff-heading">

                    <h3>
                        Staff
                    </h3>

                    ${
                        required > 0
                            ? `
                                <span>
                                    ${allocated}/${required}
                                </span>
                              `
                            : ""
                    }

                </div>

                <div class="allocated-staff-list">
                    ${staffHtml}
                </div>

            </div>

        </div>


        <div class="modal-actions">

            ${
                canManage()
                    ? `
                        <button
                            type="button"
                            class="secondary-button"
                            onclick="openStaffAllocation('${event.id}')"
                        >
                            Manage Staff
                        </button>

                        <button
                            type="button"
                            class="secondary-button danger-button"
                            onclick="deleteEvent('${event.id}')"
                        >
                            Delete Event
                        </button>

                        <button
                            type="button"
                            class="primary-button"
                            onclick="openEditEvent('${event.id}')"
                        >
                            Edit Event
                        </button>
                      `
                    : `
                        <button
                            type="button"
                            class="secondary-button"
                            onclick="closeModal()"
                        >
                            Close
                        </button>
                      `
            }

        </div>
    `);
}


/* =========================================================
   EDIT EVENT
   ========================================================= */

function openEditEvent(eventId) {

    if (!canManage()) {
        return;
    }

    const event =
        events.find(
            item => item.id === eventId
        );

    if (!event) {
        return;
    }

    const date =
        event.start_time?.slice(0, 10);

    const start =
        event.start_time
            ? new Date(event.start_time)
            : null;

    const end =
        event.end_time
            ? new Date(event.end_time)
            : null;

    const startTime =
        start
            ? `${String(
                start.getHours()
            ).padStart(2, "0")}:${String(
                start.getMinutes()
            ).padStart(2, "0")}`
            : "19:00";

    const endTime =
        end
            ? `${String(
                end.getHours()
            ).padStart(2, "0")}:${String(
                end.getMinutes()
            ).padStart(2, "0")}`
            : "20:00";

    const typeOptions =
        eventTypes
            .map(type => `
                <option
                    value="${type.id}"
                    ${
                        type.id === event.event_type_id
                            ? "selected"
                            : ""
                    }
                >
                    ${escapeHtml(type.name)}
                </option>
            `)
            .join("");

    showModal(`
        <div class="modal-header">

            <div>

                <h2>
                    Edit Event
                </h2>

                <p>
                    Update the event details.
                </p>

            </div>

            <button
                class="modal-close"
                onclick="closeModal()"
            >
                ×
            </button>

        </div>


        <form
            class="modal-form"
            onsubmit="updateEvent(event, '${event.id}')"
        >

            <div class="form-group">

                <label>
                    Event Title
                </label>

                <input
                    name="title"
                    type="text"
                    required
                    maxlength="150"
                    value="${escapeAttribute(
                        event.title || ""
                    )}"
                >

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label>
                        Event Type
                    </label>

                    <select
                        name="event_type_id"
                        required
                    >

                        ${typeOptions}

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Date
                    </label>

                    <input
                        name="date"
                        type="date"
                        required
                        value="${escapeAttribute(
                            date || ""
                        )}"
                    >

                </div>

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label>
                        Start Time
                    </label>

                    <input
                        name="start"
                        type="time"
                        required
                        value="${startTime}"
                    >

                </div>


                <div class="form-group">

                    <label>
                        End Time
                    </label>

                    <input
                        name="end"
                        type="time"
                        required
                        value="${endTime}"
                    >

                </div>

            </div>


            <div class="form-row">

                <div class="form-group">

                    <label>
                        Location
                    </label>

                    <input
                        name="location"
                        type="text"
                        maxlength="200"
                        value="${escapeAttribute(
                            event.location || ""
                        )}"
                    >

                </div>


                <div class="form-group">

                    <label>
                        Staff Required
                    </label>

                    <input
                        name="staff_required"
                        type="number"
                        min="0"
                        max="100"
                        value="${Number(
                            event.staff_required || 0
                        )}"
                    >

                </div>

            </div>


            <div class="form-group">

                <label>
                    Description
                </label>

                <textarea
                    name="description"
                    rows="5"
                    maxlength="2000"
                >${escapeHtml(
                    event.description || ""
                )}</textarea>

            </div>


            <div class="modal-actions">

                <button
                    type="button"
                    class="secondary-button"
                    onclick="openEvent('${event.id}')"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    class="primary-button"
                >
                    Save Changes
                </button>

            </div>

        </form>
    `);
}


/* =========================================================
   UPDATE EVENT
   ========================================================= */

async function updateEvent(
    formEvent,
    eventId
) {

    formEvent.preventDefault();

    if (!canManage()) {
        return;
    }

    const form =
        formEvent.target;

    const title =
        form.title.value.trim();

    const eventTypeId =
        form.event_type_id.value;

    const date =
        form.date.value;

    const start =
        form.start.value;

    const end =
        form.end.value;

    const location =
        form.location.value.trim();

    const description =
        form.description.value.trim();

    const staffRequired =
        Number(
            form.staff_required.value || 0
        );

    if (!title) {
        alert("Please enter an event title.");
        return;
    }

    if (!eventTypeId) {
        alert("Please select an event type.");
        return;
    }

    if (!date || !start || !end) {
        alert("Please provide a date and time.");
        return;
    }

    if (end <= start) {
        alert(
            "The end time must be after the start time."
        );

        return;
    }

    const startDateTime =
        `${date}T${start}:00`;

    const endDateTime =
        `${date}T${end}:00`;

    const { error } =
        await supabaseClient
            .from("events")
            .update({
                title,
                event_type_id: eventTypeId,
                start_time: startDateTime,
                end_time: endDateTime,
                location:
                    location || null,
                description:
                    description || null,
                staff_required:
                    staffRequired
            })
            .eq("id", eventId);

    if (error) {

        console.error(error);

        alert(
            error.message ||
            "Unable to update event."
        );

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

    if (!canManage()) {
        return;
    }

    const event =
        events.find(
            item => item.id === eventId
        );

    if (!event) {
        return;
    }

    const confirmed =
        confirm(
            `Delete "${event.title}"?\n\nThis cannot be undone.`
        );

    if (!confirmed) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("events")
            .delete()
            .eq("id", eventId);

    if (error) {

        console.error(error);

        alert(
            error.message ||
            "Unable to delete event."
        );

        return;
    }

    selectedEvent = null;

    closeModal();

    await loadEvents();

    render();
}


/* =========================================================
   STAFF ALLOCATION
   ========================================================= */

function openStaffAllocation(eventId) {

    if (!canManage()) {
        return;
    }

    const event =
        events.find(
            item => item.id === eventId
        );

    if (!event) {
        return;
    }

    const allocatedIds =
        (event.event_staff || [])
            .map(item => item.staff_id);

    const required =
        Number(event.staff_required || 0);

    const staffHtml =
        staff.map(member => {

            const checked =
                allocatedIds.includes(
                    member.id
                );

            return `
                <label class="staff-checkbox">

                    <input
                        type="checkbox"
                        name="staff"
                        value="${member.id}"
                        ${checked ? "checked" : ""}
                    >

                    <span>
                        ${escapeHtml(member.name)}
                    </span>

                </label>
            `;

        }).join("");

    showModal(`
        <div class="modal-header">

            <div>

                <h2>
                    Manage Staff
                </h2>

                <p>
                    ${escapeHtml(event.title)}
                </p>

            </div>

            <button
                class="modal-close"
                onclick="closeModal()"
            >
                ×
            </button>

        </div>


        <div class="staff-allocation-info">

            <strong>
                Staff required:
            </strong>

            <span>
                ${required > 0 ? required : "No limit"}
            </span>

        </div>


        <div
            class="staff-allocation-list"
            id="staff-allocation-list"
        >

            ${staffHtml}

        </div>


        <div class="modal-actions">

            <button
                type="button"
                class="secondary-button"
                onclick="openEvent('${event.id}')"
            >
                Cancel
            </button>

            <button
                type="button"
                class="primary-button"
                onclick="saveStaffAllocation('${event.id}')"
            >
                Save Staff
            </button>

        </div>
    `);
}


/* =========================================================
   SAVE STAFF ALLOCATION
   ========================================================= */

async function saveStaffAllocation(eventId) {

    if (!canManage()) {
        return;
    }

    const event =
        events.find(
            item => item.id === eventId
        );

    if (!event) {
        return;
    }

    const checkboxes =
        document.querySelectorAll(
            '#staff-allocation-list input[name="staff"]'
        );

    const selectedIds =
        Array.from(checkboxes)
            .filter(input => input.checked)
            .map(input => input.value);

    const required =
        Number(event.staff_required || 0);

    if (
        required > 0 &&
        selectedIds.length > required
    ) {

        alert(
            `This event requires ${required} staff.`
        );

        return;
    }

    const { error: deleteError } =
        await supabaseClient
            .from("event_staff")
            .delete()
            .eq("event_id", eventId);

    if (deleteError) {

        console.error(deleteError);

        alert(
            deleteError.message ||
            "Unable to update staff allocation."
        );

        return;
    }

    if (selectedIds.length > 0) {

        const rows =
            selectedIds.map(staffId => ({
                event_id: eventId,
                staff_id: staffId
            }));

        const { error: insertError } =
            await supabaseClient
                .from("event_staff")
                .insert(rows);

        if (insertError) {

            console.error(insertError);

            alert(
                insertError.message ||
                "Unable to allocate staff."
            );

            return;
        }
    }

    closeModal();

    await loadEvents();

    render();
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

    } else if (currentView === "week") {

        currentDate.setDate(
            currentDate.getDate() - 7
        );

    } else {

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

    } else if (currentView === "week") {

        currentDate.setDate(
            currentDate.getDate() + 7
        );

    } else {

        currentDate.setDate(
            currentDate.getDate() + 1
        );
    }

    render();
}


/* =========================================================
   MODALS
   ========================================================= */

function showModal(content) {

    closeModal();

    const modal =
        document.createElement("div");

    modal.id = "schedule-modal";

    modal.className = "modal-overlay";

    modal.innerHTML = `
        <div
            class="modal-card"
            onclick="event.stopPropagation()"
        >
            ${content}
        </div>
    `;

    modal.addEventListener(
        "click",
        handleModalBackdrop
    );

    document.body.appendChild(modal);
}


function handleModalBackdrop(event) {

    if (
        event.target.id ===
        "schedule-modal"
    ) {
        closeModal();
    }
}


function closeModal() {

    const modal =
        document.getElementById(
            "schedule-modal"
        );

    if (modal) {
        modal.remove();
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

function openLoginModal() {

    showModal(`
        <div class="modal-header">

            <div>

                <h2>
                    Staff Login
                </h2>

                <p>
                    Sign in to access staff tools.
                </p>

            </div>

            <button
                class="modal-close"
                onclick="closeModal()"
            >
                ×
            </button>

        </div>


        <form
            class="modal-form"
            onsubmit="login(event)"
        >

            <div class="form-group">

                <label>
                    Email
                </label>

                <input
                    name="email"
                    type="email"
                    required
                    autocomplete="username"
                    placeholder="Staff email"
                >

            </div>


            <div class="form-group">

                <label>
                    Password
                </label>

                <input
                    name="password"
                    type="password"
                    required
                    autocomplete="current-password"
                    placeholder="Password"
                >

            </div>


            <div
                id="login-error"
                class="form-error"
            ></div>


            <div class="modal-actions">

                <button
                    type="button"
                    class="secondary-button"
                    onclick="closeModal()"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    class="primary-button"
                >
                    Login
                </button>

            </div>

        </form>
    `);
}


async function login(formEvent) {

    formEvent.preventDefault();

    const form =
        formEvent.target;

    const email =
        form.email.value.trim();

    const password =
        form.password.value;

    const errorBox =
        document.getElementById(
            "login-error"
        );

    if (errorBox) {
        errorBox.textContent = "";
    }

    const { error } =
        await supabaseClient.auth
            .signInWithPassword({
                email,
                password
            });

    if (error) {

        console.error(error);

        if (errorBox) {
            errorBox.textContent =
                error.message ||
                "Unable to log in.";
        }

        return;
    }

    closeModal();

    const { data } =
        await supabaseClient.auth
            .getSession();

    currentUser =
        data?.session?.user || null;

    await loadAccess();

    render();
}


async function logout() {

    await supabaseClient.auth.signOut();

    currentUser = null;

    currentAccess = null;

    render();
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function toDateInputValue(date) {

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


function formatDate(dateString) {

    if (!dateString) {
        return "";
    }

    return new Date(
        `${dateString}T12:00:00`
    ).toLocaleDateString(
        "en-GB"
    );
}


function formatDisplayDate(dateString) {

    if (!dateString) {
        return "";
    }

    return new Date(
        `${dateString}T12:00:00`
    ).toLocaleDateString(
        "en-GB",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}


function formatShortDate(dateString) {

    if (!dateString) {
        return "";
    }

    return new Date(
        `${dateString}T12:00:00`
    ).toLocaleDateString(
        "en-GB",
        {
            day: "numeric",
            month: "short"
        }
    );
}


function formatTime(dateTime) {

    if (!dateTime) {
        return "";
    }

    return new Date(
        dateTime
    ).toLocaleTimeString(
        "en-GB",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}


function formatHour(hour) {

    return `${String(hour).padStart(2, "0")}:00`;
}


function startOfWeek(date) {

    const result =
        new Date(date);

    result.setHours(
        0,
        0,
        0,
        0
    );

    let day =
        result.getDay();

    if (day === 0) {
        day = 7;
    }

    result.setDate(
        result.getDate() -
        (day - 1)
    );

    return result;
}


function isToday(date) {

    const today =
        new Date();

    return (
        date.getFullYear() ===
            today.getFullYear() &&
        date.getMonth() ===
            today.getMonth() &&
        date.getDate() ===
            today.getDate()
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
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {

    return escapeHtml(value);
}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.render = render;

window.handleDateClick =
    handleDateClick;

window.openCreateEventModal =
    openCreateEventModal;

window.createEvent =
    createEvent;

window.openEvent =
    openEvent;

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

window.setView =
    setView;

window.goToday =
    goToday;

window.previousPeriod =
    previousPeriod;

window.nextPeriod =
    nextPeriod;

window.openLoginModal =
    openLoginModal;

window.login =
    login;

window.logout =
    logout;

window.closeModal =
    closeModal;


/* =========================================================
   START
   ========================================================= */

init();

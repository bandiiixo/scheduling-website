KNG ENTERTAINMENT - HOST AN EVENT FULL PACK

This is the full KNG Entertainment app pack. Replace the matching project files with the files in this ZIP.

IMPORTANT DATABASE STEP
Run KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql in the Supabase SQL Editor before testing the new Host an Event or Prize features.

HOST AN EVENT
- Hungry Pool is replaced by Host an Event.
- Randomise Empty Slots fills only empty slots.
- Random events never repeat directly beside themselves.
- Club 77 and Vanilla are manual-only choices and are never selected by the randomiser.
- Planned events can repeat daily, weekly or biweekly and protect their slots from the randomiser.
- Every slot remains manually editable after randomisation.
- Signed-in KNG staff get a Claim button on each slot.
- Claim records the signed-in Discord account's Discord ID and staff name on that event.
- A claimed slot cannot be claimed by another person.

PRIZES & COMMANDS
- Prize Win form stays directly on the page.
- Dirty Money, Dollars and Event VIP are built in.
- Amount and item code auto-fill from the selected prize.
- Reason is entered manually.
- Command is generated as !additem ID CODE AMOUNT Reason.
- Copy command is available before recording the win.
- Prize wins can be marked done.

Keep index.html, supabase.js, app.js and style.css together. Do not delete the existing HOF/background assets unless you have a separate reason to remove them.


CLAIM / DISPLAY NAME UPDATE - 30 OCT 2026
- Staff can set their own KNG Display Name from the sidebar.
- Claims show the display name instead of the Discord ID.
- Discord IDs remain stored internally for identity/security.
- Staff can unclaim their own event until one hour before its Europe/London start time.
- Within the one-hour cutoff, the unclaim control is locked.
- Run KNG-DISPLAY-NAME-UNCLAIM-PATCH.sql if the database already has the previous host-claim migration.
- The complete migration in this pack also contains the same fixes.

UI / ROSTER PATCH 30 OCT 2026
- Monthly calendar now hides the high-volume entertainment event cards to stop the month view becoming an unreadable wall of boxes. Meetings remain visible.
- Week / Day / Agenda continue to show the full entertainment schedule.
- Command Dashboard now shows the next 8 upcoming events from the current time, rolling into later dates instead of showing already-passed events.
- Replaced the text crown in the header with the supplied KNG crown asset: kngcroiwn.png.
- Staff Roster keeps Actions / Interactions allocation and explicit REMOVE ROLE controls so staff can be removed and reallocated.
- Discord export remains copy/paste-ready and uses <@DISCORDID> mentions.
- Existing Host an Event, randomiser, planned-slot protection, claim/unclaim, display names, prizes/commands, security and all other integrated functionality are preserved.

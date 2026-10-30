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

KNG ENTERTAINMENT FULL UPDATE

UPLOAD:
Replace the files in the Render/GitHub site with the files in this pack.
Keep the whole pack together.

SUPABASE:
Before testing the new features, run:
KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql
in Supabase SQL Editor.

The migration is designed to be re-runnable and includes:
- host_source / host_locked event fields
- planned-event support
- three standard event prizes
- prize win reason and completion fields
- existing KNG Entertainment permissions and operations tables

HOST AN EVENT:
The old Hungry Pool navigation item is now Host an Event.

Randomiser:
- Select the date and time range.
- Choose 30 or 60 minute slots.
- Randomise Empty Slots.
- It only fills empty slots.
- It does not select Club 77 or Vanilla.
- It does not place the same event directly next to itself in one run.

Planned events:
- Add Planned Event.
- Choose one-time, daily, weekly or biweekly.
- Planned slots are protected from randomisation.

Manual events:
- Add Event.
- Club 77 and Vanilla are available manually.
- Any event can be manually placed.
- Any slot can be edited later.

PRIZES:
The Prize Win form is on the page.
Enter in-game ID, choose the prize type, enter a reason, then copy the generated command.
After the command is given in Discord, tick Done in the Prize Wins & Command Vault.

Standard prizes:
- Dirty Money / dinheirosujo / 500000
- Dollars / dollars / 500000
- Event VIP / vipevento1 / 1

The application uses the existing Supabase URL/publishable key already supplied for this project.
Do not add a service-role key to the browser.

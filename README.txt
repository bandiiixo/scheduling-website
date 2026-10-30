KNG ENTERTAINMENT - FINAL INTEGRATED BUILD

This pack is the current full KNG Entertainment build. It keeps the existing schedule/event/prize/Hall of Fame functionality and applies the latest requested fixes without adding Hungry Pool back into the UI or migration.

SIDEBAR ORDER
1. Schedule
2. Event Suggestions
3. Host an Event
4. Prizes & Commands
5. Hall of Fame
6. Personal Dashboard
7. Staff Roster
8. Command Dashboard
9. Actions & Interactions
10. Access Requests
11. Security

LATEST FIXES
- Monthly calendar no longer dumps every F3/event into each date cell. Public events are shown as a compact count; meetings/staff events remain visible.
- Command Dashboard shows upcoming events from the current time, not events whose times have already passed.
- Command Dashboard shows Most Popular Events based on completed attendance.
- Personal Dashboard contains the Daily Goal and operational overview without Points, Hungry Pool or Reductions panels.
- Staff performance ranking is based on hosted events, activity and points, and is shown as supporting dashboard content rather than a sidebar tab.
- Host an Event page restored with today's host schedule, claim buttons, randomise-empty-slots, planned-event and add-event controls.
- Event hosting records the actual Discord-linked staff name/ID.
- Approved staff automatically receive a staff record and a pending Actions/Interactions roster entry.
- Staff Roster has explicit Interactions and Actions allocation, removal back to unallocated, editing, promotion and separate Discord-copy buttons.
- Roster export format uses <@DISCORD_ID> mentions and the team member total.
- ALOPA is removed from the roster UI/database migration.
- Discord display-name edits update the actual staff roster record.
- Public F3 is a public-only view accessible from the header, not a sidebar management tab.
- KNG crown asset is used in the header.
- Prize Commands retains Prize Win and command copying, plus Name Change and Character Reset utility items.
- No Hungry Pool tables, RPCs or policies are included in the final migration.
- SQL includes the original KNG base schema so the migration can cover missing base tables as well as Entertainment additions.

DATABASE
Run ONLY:
KNG-ENTERTAINMENT-COMPLETE-FINAL-MIGRATION.sql

Do not run the older KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql alongside this file.

DEPLOYMENT
1. Replace the repo files with this pack.
2. Commit/push to GitHub.
3. Let Render redeploy.
4. Run the FINAL migration once in Supabase SQL Editor.
5. Hard refresh the site with Ctrl+F5.

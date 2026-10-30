KNG ENTERTAINMENT FINAL BUILD
=============================

This is the preserved KNG Entertainment build with the requested fixes merged in.

IMPORTANT:
- Upload/replace the web files from this pack together. Do not mix app.js/style.css from older packs.
- Run ONLY KNG-ENTERTAINMENT-COMPLETE-FINAL.sql in Supabase for this build.
- Do not run the old migration files from previous packs.
- The SQL does not create or restore a Hungry Pool feature.
- Existing points/reductions database records are left alone for compatibility, but they are not shown on Personal Dashboard and are not navigation tabs.
- ALOPA has been removed from the roster schema/UI.
- Existing approved staff are backfilled into the staff table where needed.
- Existing roster names are backfilled and stored on the roster itself.
- Approval now creates/repairs the staff row so the post-approval Actions/Interactions allocation step works.
- Roster allocation can move a staff member between Actions and Interactions.
- Roster exports use <@DISCORD_ID> format.
- Month view shows a compact F3 event count rather than stacking every F3 event.
- Public F3 remains available as the public day schedule.
- Command Dashboard contains Most Popular Events based on recorded attendance.
- Leaderboard contains Most Events Hosted plus other staff activity measures.
- Hall of Fame frame assets include Colour Wheel, Fire, Rainbow and Custom.
- The supplied crown asset is used in the header.

SQL is deliberately written without DROP FUNCTION on has_schedule_access(text), avoiding the parameter-default error caused by the old migration.

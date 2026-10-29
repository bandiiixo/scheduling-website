KNG ENTERTAINMENT - FULL INTEGRATED UPLOAD PACK
================================================

This pack restores the integrated KNG Entertainment operations layer AND the new permission hierarchy.

PERMISSION HIERARCHY
PUBLIC -> MEMBER -> ADM -> MANAGER -> DIRECTOR

AUTH
----
Discord-only authentication.

FILES TO REPLACE IN YOUR WEBSITE
--------------------------------
1. app.js
2. style.css
3. kng-background.png

KEEP YOUR EXISTING FILES
------------------------
- index.html
- supabase.js

DATABASE
--------
kng_schedule_operations.sql contains the integrated operations database layer.
It adds:
- recurring/staff-only Community Meetings
- event visibility and completion status
- Party / Event / Battle Royale / Community Meeting presets
- operations tracker/logging
- completed-event counts and popularity leaderboard
- Actions & Interactions hub
- prize catalogue + prize wins
- command vault + copy buttons + auto-generated commands
- crashout timeouts
- kick-off / remove-from-team blocks
- staff access requests and approval chain
- Entertainment permission handling

IMPORTANT
---------
Do NOT run the SQL blindly alongside other migration scripts. The existing KNG Schedule schema must already exist first.
Your Director permission has already been assigned in Supabase.

EVENT PRESETS
-------------
Party
Event
Battle Royale
Community Meeting

Community Meeting is configured as staff-only and biweekly.

SECURITY
--------
The UI hides features based on permission, but the Supabase RLS policies/RPCs in the SQL are the real security boundary.

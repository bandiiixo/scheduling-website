KNG ENTERTAINMENT · INTEGRATED OPERATIONS

This build turns the KNG Schedule into KNG Entertainment and integrates the useful operations features discovered in the supplied browser source.

Included:
- KNG Entertainment calendar
- Party / Event / Battle Royale / Community Meeting presets
- Recurring events, including every-2-weeks Community Meetings
- Player-visible vs staff-only events
- Actions & Interactions hub
- Tracker, Hungry Pool, Reductions and Helpers
- Automatic event audit logging
- Completed-event counts and popularity leaderboard
- Prizes, Prize Wins and a command vault with Copy buttons
- Entertainment permission level
- Security: bulk crashout timeout and bulk kick-off/block
- Staff-only access restriction screen

Files:
- app.js
- style.css
- kng_schedule_operations.sql
- kng-background.png

Install:
1. Replace your current app.js and style.css with these versions.
2. Keep index.html and supabase.js.
3. Run kng_schedule_operations.sql in the same Supabase project, after your existing Schedule schema.
4. Refresh the site.

Notes:
- The default prize command template is /giveitem {discord_id} {code} {amount}. Change it per prize if your server uses a different command.
- Staff-only meetings are hidden from players.
- A timeout is enforced by the web app against the user's email until expires_at.
- Kick-off/block uses an app-level deny list, so the account remains in Supabase Auth but cannot use KNG Entertainment while blocked.
- The original Socket.IO/Engine.IO dependency code is intentionally not copied. The useful behaviour is recreated against the Schedule's own Supabase backend.

KNG ENTERTAINMENT - FULL FIXED DEPLOY PACK

This is the full build. It keeps the existing KNG Schedule calendar and integrates the KNG Entertainment operations, Actions/Interactions tools, Discord login, access hierarchy, prize commands, security, event completion, recurring events and Hall of Fame editor.

UPLOAD THESE FILES TO THE ROOT OF YOUR RENDER/GITHUB REPOSITORY
- index.html
- supabase.js
- app.js
- style.css
- kng-background.png
- kng-hof-original.png
- kng-hof-gold.png
- kng-hof-emerald.png
- kng-hof-ocean.png
- kng-hof-sunset.png
- kng-hof-pink.png
- kng-hof-grey-scale.png
- hof-frame-source-original.png

DATABASE
- KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql is the database migration.
- Run it in Supabase SQL Editor after uploading the website files.
- It is designed to be re-runnable and includes the missing Hall of Fame/Daily Goals tables, event completion fields, recurring event fields, staff access requests, Operations tables, Actions/Interactions roster, security/RLS and Hall of Fame image storage.
- The migration also fixes staff-event visibility at the database level: public/players cannot query staff-only events, while confirmed MEMBER/ADM/MANAGER/DIRECTOR users can.

IMPORTANT PERMISSION HIERARCHY
PUBLIC < MEMBER < ADM < MANAGER < DIRECTOR
- Discord login identifies the user but does not automatically grant staff access.
- PUBLIC can see player-facing events.
- Confirmed MEMBER+ can see staff-only meetings/events.
- ADM can manage Entertainment operations and confirm MEMBER access.
- MANAGER can confirm MEMBER and ADM access and manage staff meetings.
- DIRECTOR can confirm MEMBER, ADM and MANAGER access and change crashout limits/daily targets.
- Director access is assigned directly by an existing Director.

FEATURES RETAINED
- Existing Month / Week / Day / Agenda schedule
- Party / Event / Battle Royale / Community Meeting presets
- Recurring events: weekly, fortnightly, monthly
- Community Meeting preset automatically selects staff-only + every 2 weeks
- Staff meetings are staff-only and separate from event statistics
- Event completion with attendance, winner and completion notes
- Completed-event leaderboard from most popular to least popular
- Actions & Interactions side allocation and hierarchy
- Tracker / Hungry Pool / Reductions / Helpers
- Points and staff leaderboard
- Prize Win flow
- Commands tab / command vault with one-click Copy
- Automatic command placeholders: {discord_id}, {name}, {code}, {amount}
- Kick-off / remove-from-team flow defaults to Inactivity
- Crashout protection and timeout system
- Access requests and approval chain
- Public event suggestions and event feedback
- KNG Estate Roleplay Hall of Fame frame editor with original/gold/emerald/ocean/sunset/pink/grey frames
- Hall of Fame photo drag + wheel zoom, custom colour controls and persistent photo position/scale
- Hall of Fame winner download
- Daily Goals with Director-only target changes

DEPLOY
1. Replace the files above in the repository.
2. Commit and push to GitHub.
3. Wait for Render to redeploy.
4. Open Supabase SQL Editor and run KNG-ENTERTAINMENT-COMPLETE-MIGRATION.sql once.
5. Hard refresh the website with Ctrl+F5.

DO NOT CHANGE
- Supabase project URL
- Supabase publishable key
- Discord OAuth client ID/secret
- Render service settings

If the site is opened before the migration is run, the app now shows an in-page database setup message instead of throwing the old browser schema-cache alerts for Hall of Fame/Daily Goals.

KNG ENTERTAINMENT + KNG INTERACTIONS INTEGRATION

This pack integrates the existing KNG Entertainment Schedule/Operations site with the Interactions site shown in the user's video.

REPLACE IN GITHUB:
- app.js
- style.css
- kng-background.png

KEEP YOUR EXISTING:
- index.html
- supabase.js

NEW DATABASE MIGRATION:
- kng_interactions_integration.sql

The migration adds:
- Command Dashboard data
- Announcements
- Hall of Fame winners/frames
- Daily Goals
- Hall of Fame image storage bucket
- Event type naming: F3 -> Party, BR -> Battle Royale, Meeting -> Community Meeting, adds Event
- is_meeting flag so Community Meeting and Staff Meeting do not count as entertainment events/leaderboard entries

The existing KNG Entertainment operations SQL is NOT included here because it has already been installed successfully.

After deploying the new app.js/style.css/background, run ONLY kng_interactions_integration.sql in Supabase.

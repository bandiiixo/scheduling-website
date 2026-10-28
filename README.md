# KNG Staff Portal

Private KNG staff monitoring portal built as a static frontend with Supabase Auth and database/RLS.

## Stack
- Static HTML/CSS/JavaScript
- Supabase Auth
- Supabase Postgres + RLS
- Render Static Site

## Frontend files
- `index.html` - app shell
- `style.css` - KNG portal styling
- `app.js` - portal UI and Supabase workflows
- `supabase.js` - public Supabase project configuration

## Important
The Supabase publishable/anon key is intentionally client-side. Never put a Supabase service-role/secret key in this repository.

The current portal expects the account, team, membership, access-key and review functions/tables created in Supabase.

## Deployment on Render
Create a Static Site from this GitHub repository.
- Build command: leave blank
- Publish directory: `.`
- Auto-deploy: enabled

## Database migration
`schema.sql` adds the portal's task, task log, FAQ, Discord slot and audit tables plus their RLS policies and starter content.

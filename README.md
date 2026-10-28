# KNG Schedule

Standalone KNG event scheduling website for public/player viewing and authorised staff management.

## Stack
- Static HTML/CSS/JavaScript
- Supabase Auth
- Supabase Postgres + RLS
- Render Static Site

## Files
- `index.html` - app shell
- `style.css` - KNG Schedule styling
- `app.js` - calendar, events, staff allocation and login workflows
- `supabase.js` - KNG Schedule Supabase project configuration
- `schema.sql` - database tables, starter event types and RLS policies

## Modes
- Public/player view requires no login.
- Manager/admin staff can create, edit, delete and allocate event staff.
- Supabase RLS protects management operations. Hiding buttons is not the security layer.

## Deployment on Render
Create a separate Static Site from the KNG Schedule GitHub repository.
- Build command: leave blank
- Publish directory: `.`
- Auto-deploy: enabled

## Important
This site must use its own Supabase project. Do not point `supabase.js` at the KNG Staff Portal project.
Never put a Supabase service-role/secret key in this repository.

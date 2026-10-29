KNG ENTERTAINMENT - INTEGRATED OPERATIONS
==========================================

Permission hierarchy
--------------------
PUBLIC -> MEMBER -> ADM -> MANAGER -> DIRECTOR

Security chain
--------------
- Discord login proves identity only. A logged-in account remains PUBLIC until approved.
- ADM can confirm MEMBER access.
- MANAGER can confirm MEMBER or ADM access.
- DIRECTOR can confirm MEMBER, ADM or MANAGER access.
- DIRECTOR access is assigned directly by an existing Director rather than through the normal request chain.
- Users can request only the next permission level in sequence.
- Database RPCs enforce the approval chain, not just the UI.
- Director inherits all permissions and can see/do everything.

Navigation
----------
The old horizontal operations tabs are now a left-hand sidebar. On small screens the sidebar becomes a horizontal scroll strip for usability.

Discord-only authentication
---------------------------
- The website offers Discord login only. There is no email/password login form.
- For a true Discord-only setup, disable the Email provider in Supabase Authentication -> Providers as well.

Discord OAuth setup
-------------------
1. In Supabase Authentication -> Providers, enable Discord.
2. In Discord Developer Portal, create/configure an OAuth2 application.
3. Add this Supabase callback URL to Discord:
   https://okjqasuwcvrumvyakulo.supabase.co/auth/v1/callback
4. Put the Discord client ID/secret into Supabase.
5. Add the deployed KNG site URL to Supabase Authentication -> URL Configuration -> Redirect URLs.

Database
--------
Run kng_schedule_operations.sql after the existing KNG Schedule schema. The SQL is re-runnable and contains the access request table plus secure approval RPCs.

Important
---------
The SQL should be treated as the source of truth for permissions. Do not rely on hiding buttons in the browser as a security boundary.

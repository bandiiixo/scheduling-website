KNG ENTERTAINMENT + INTERACTIONS FIXED INTEGRATION

This pack keeps the current KNG Entertainment red/black Schedule theme and fixes the integrated Interactions tabs.

FILES TO REPLACE IN THE REPO
- app.js
- style.css
- kng-background.png
- kng-hof-frame.png (new)

KEEP YOUR EXISTING
- index.html
- supabase.js

DATABASE
Run kng_interactions_integration.sql once in Supabase SQL Editor after the existing KNG operations setup.
It creates/updates the Interactions tables, Hall of Fame storage bucket, event meeting flags, and requested event type names.

HALL OF FAME
The editor uses the KNG ESTATE ROLEPLAY frame shown in the supplied reference video, with:
- frame library
- Original / Colour Wheel / Fire / Rainbow / Gray Scale / Custom
- colour wheel
- hue slider
- intensity slider
- HEX + RGB display
- reset colour
- winner photo upload
- drag-to-move and scroll-to-zoom
- Copy and Download
- saved winner name and styling

TAB FIX
The previous integration kept the Interaction view state active when switching to Operations tabs. That prevented many tabs from changing page. This version clears the Interaction view state when an Operations/Schedule tab is selected and loads both data sets for the Command Dashboard.

# Vivid Centre Growth

The team dashboard served at growth.vividcentre.com.

- `index.html` – the page: access-code screen, sidebar and all sections
- `app.js` – calculations and charts
- `shim.js` – loads the numbers from the Supabase data endpoint using the access code
- `d3.min.js` – charting library (bundled, no outside requests)
- `CNAME` – tells GitHub Pages which domain to serve

There are no secrets in this repository. Only a one-way hash of the access code is kept, in Supabase
(`app_settings.access_code_hash`), and the server checks the code on every request.
The endpoint returns totals only; client names never reach the browser.

To change the goals (150 members, 40% conversion), edit the constants at the top of `app.js`.

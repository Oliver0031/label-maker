# Project Guidelines for Label Maker

## Tech Stack
- Vanilla HTML5, CSS3, ES6+ JavaScript.
- External Libraries (loaded via CDN):
  - pdf-lib (`https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js`)
  - PDF.js (`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`)

## Code Conventions
1. Keep processing 100% client-side inside the browser.
2. Maintain clean separation of concerns:
   - `index.html`: Main UI shell and layout controls.
   - `styles.css`: Responsive layout, control sidebar, live preview canvas, print styles.
   - `js/pdf-combiner.js`: Logic for PDF text parsing, auto-sorting, name extraction, and canvas merging.
   - `js/app.js`: UI event handling and user interactions.
3. Include `@media print` rules to hide UI controls during browser printing.
4. 

# PDF Data & Parsing Specification

## 1. Tax Invoice PDF Layout
- Page Size: Standard A4 portrait.
- Identifying Keywords: Contains text string "TAX INVOICE" or "Bill To".
- Placement Target: Top portion of the target combined A4 output page.

## 2. Shipping Label PDF Layout
- Page Size: Thermal/Compact shipping label dimensions.
- Identifying Keywords: Contains text strings "DELIVER TO", "AWB", or "TRACKING NO".
- Data Extraction Target: Text under "PRODUCT DETAILS" header. Extract the first 3 to 5 words for auto-naming.
- Placement Target: Bottom portion of the combined A4 page, rotated 90 degrees horizontally.
- 

# MedSearch Design QA

- Data sources: `data.pdf`, `pw1.pdf`, and `pw2.pdf`
- Source pages extracted: 588 of 588
- Search index: 1,664 page-aware chunks
- Active source SHA-256 values: `645026e45063f99be03ff6f2527533e6321877d28b4a49825af4fd6080930ca4`, `338300b76172d410b91048209305fac53e1166c3be295a18b3f2c0c7c6b54182`, `f154bcc6206489dcab08f07114dc0ca2c45b0b26f136b898ace684379cd4e552`
- Desktop viewport: 1440 x 1024
- Mobile viewport: 390 x 844
- Visual PDF samples: cover, contents, recommendation, treatment, and final pages from all three sources

## Layout checks

- User questions appear as blue-tinted bubbles on the right with the user avatar after the message.
- MedSearch responses remain on the left with the assistant avatar before the response.
- Each MedSearch response contains exactly two short, single-line text rows.
- No response headings, alerts, source panels, citations, result cards, or guidance blocks are rendered.
- The composer stays visible without covering the active message on desktop and mobile.
- The recent-chat sidebar becomes an accessible drawer on mobile.

## Data and interaction checks

- Removed the previous tablet CSV and its CSV-specific interface copy.
- Loaded `knowledge-base.json`, rebuilt exclusively from the three supplied PDFs.
- Submitted antenatal-care, acute-malnutrition, folic-acid, and postpartum-haemorrhage questions and confirmed each answer contained exactly two text rows.
- Submitted an unknown condition and confirmed the required not-found response appeared.
- Submitted ambiguous symptoms and confirmed MedSearch did not guess a condition.
- Confirmed medicine responses use only wording extracted from the three new PDFs, with no invented dose.
- Added a same-origin server endpoint for OpenRouter's `openrouter/free` router; the browser never receives the API key.
- Confirmed the endpoint returns the two-line document fallback when `OPENROUTER_API_KEY` is unavailable.
- Confirmed model output is rejected unless its meaningful words and numbers are grounded in the retrieved PDF context.
- Confirmed the removed alert, retrieval, suggestion, medicine, citation, and expandable-detail UI is absent.
- Opened the recent-chat drawer at the mobile viewport.
- Browser console errors: none.
- Production build: passed.

final result: passed

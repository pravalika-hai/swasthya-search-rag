# MedSearch Design QA

- Data source: `medical info.pdf`
- Source pages inspected: 24 of 24
- Search index: 58 condition-focused sections
- Active source SHA-256: `e8dd7f46b11fd213ae6d26f8a7bb1d397768ebe36db427800b8adb4519e549e3`
- Desktop viewport: 1440 x 1024
- Mobile viewport: 390 x 844
- Desktop capture: `work/qa/medsearch-minimal-chat.png`

## Layout checks

- User questions appear as blue-tinted bubbles on the right with the user avatar after the message.
- MedSearch responses remain on the left with the assistant avatar before the response.
- Each MedSearch response contains exactly two short, single-line text rows.
- No response headings, alerts, source panels, citations, result cards, or guidance blocks are rendered.
- The composer stays visible without covering the active message on desktop and mobile.
- The recent-chat sidebar becomes an accessible drawer on mobile.

## Data and interaction checks

- Removed the previous tablet CSV and its CSV-specific interface copy.
- Loaded `medical-info.json`, rebuilt exclusively from the supplied 24-page PDF.
- Submitted a dengue question and confirmed the answer contained exactly two text rows.
- Submitted an unknown condition and confirmed the required not-found response appeared.
- Submitted ambiguous symptoms and confirmed MedSearch did not guess a condition.
- Submitted a diabetes medicine question and confirmed the response used only medicine wording explicitly found in the new PDF, with no invented dose.
- Confirmed the removed alert, retrieval, suggestion, medicine, citation, and expandable-detail UI is absent.
- Opened the recent-chat drawer at the mobile viewport.
- Browser console errors: none.
- Vercel and production builds: passed.

final result: passed

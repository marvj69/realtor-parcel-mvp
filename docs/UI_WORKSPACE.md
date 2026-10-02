# Parcel workspace UI

This refresh uses the existing MapLibre, Next.js, encrypted immutable parcel assets,
and Neon accounts/projects/notes architecture. It adds no services or dependencies,
changes no schema, and performs no bulk import.

## Working surfaces

The desktop navigation rail opens Explore, Property, Projects, Compare, Measure,
and Offline. Closing a panel expands the map. On phones, these tools use bottom
navigation and a scrollable panel with expand/reduce controls.

Explore searches the existing ranked API. The top 50 returned records can be
filtered by county, recorded acreage, source land-use/class, and the mailing-address
hint, then sorted by relevance, address, acreage, or assessment. These are explicitly
result-set filters; they do not filter every parcel in the dataset. Missing numeric
data does not pass an acreage filter, and zero remains distinct from missing data.
Each result says why it matched (owner, address, APN, ...). The listed results appear
as numbered pins on the map while Explore is open; the map button fits them in view.
Market shortcuts move the map without inventing parcel records.

The header search (desktop) is a typeahead over the same API: arrow keys and Enter
pick a result, and "See all" opens Explore with its filters. On phones the header
button opens Explore.

Addresses are cleaned up for display only: empty or `0` segments are dropped,
"MI, 49829" becomes "MI 49829", and all-caps words are title-cased. Nothing is added,
CSV exports keep the source text, and the Source record tab shows both addresses as
recorded. Owner names are shown as recorded.

The mailing-address hint compares the recorded mailing address with the site address
after normalizing common county variants (ST/STREET, N 123/N123, CO RD/CR, highway
words, ordinals, one- or two-letter typos). It reports only "Out-of-state mailing
address (XX)" or "Mailing address differs from site address". PO boxes, unnumbered
vacant land, and missing data produce no hint. The UI labels it a hint to verify,
because owners use other mailing addresses for many reasons.

Property includes a boundary-shape preview drawn from the selected geometry,
overview and provenance tabs, an original-source link when available, structured
workflow tags, notes, CSV export, and a printable brief preview. The Save button saves
to the last-used project in one click; its menu saves to another project or creates
one. Once saved, the header shows "Saved in <project> · <tag>" chips, and Save & notes
lists every project the parcel is in with its tag, its notes (edit/delete), and
Remove from project. Source dates are
formatted in UTC to preserve the source calendar day. Assessment is not presented
as market value. The printed brief includes provenance and the full disclaimer.
Use Print / Save PDF in a browser with print support; the preview remains usable
in embedded browsers whose host does not implement a native print dialog.

Selecting a parcel automatically calculates approximate acreage, boundary
perimeter in feet, and consecutive boundary dimensions from its available
geometry using Turf geodesic measurements. These appear beside the unchanged
recorded acreage and in the printable brief. Dimensions read `175 × 120 × 65 ft`,
clockwise from the retained corner closest to each boundary's northwest bounding
corner, through every side and back to the start. Straight/redundant GIS vertices
are grouped using a one-foot simplification tolerance in a local feet projection;
lengths still follow the original geodesic segments between those corners.
Curved boundaries can have several lengths. Source winding/start vertex does not
change the sequence. Each MultiPolygon part and interior hole has a separate
sequence, without connecting gaps. Holes are subtracted from area and included
in perimeter; total area and perimeter include all parts.
Missing, non-finite, unclosed, or zero-area geometry shows measurements
unavailable. Offline selections use the geometry saved in the offline area,
which may be less detailed than a full online lookup. Calculations run locally
without another API request or any changes to stored source records.

Comparisons (maximum three) and unsaved notes live only in page memory. Switching
panels preserves note drafts; reloading discards them. Save to project persists notes
and tags. Projects can be renamed or deleted, and saved parcels can change tag, be
removed, or have notes edited/deleted. Destructive actions ask for an inline
confirmation; deleting a project removes its saved parcels and notes. Every edit
route is scoped to the signed-in owner (`/api/projects/:id`, `/api/saved-parcels/:id`,
`/api/parcel-notes/:id`). Parcel snapshots retained for saved parcels stay in Neon
after removal until the guarded prune in docs/STATIC_PARCELS.md. Project search
matches loaded project/client names, addresses, APNs, owners, and note text. The
list loads up to 50 projects with up to 100 saved parcels each, and labels that
limit. CSV exports contain the displayed public parcel records and provenance,
not private notes. Formula-like source text is escaped for spreadsheet safety.

This browser remembers (localStorage, per device): map settings (basemap, layers,
fill opacity), the last-used project, and up to eight recently viewed parcels'
public-record fields. Explore has a Clear button for recently viewed parcels. A
remembered project that was renamed or deleted elsewhere falls back to the newest
project.

The map toolbar controls topo/satellite basemaps, parcel boundary visibility, the
saved-parcel layer (points colored by workflow tag, visible at every zoom), parcel fill
opacity, and satellite road/place labels. MapLibre supplies compass, location, and
imperial scale controls. Locate asks for the device location, selects the parcel there
(or the downloaded offline parcel when offline), and reports GPS accuracy with a
reminder that GPS and parcel lines are both approximate. Location requires normal
browser permission. Copied links keep zoom/center/bearing and the selected parcel ID
(`?parcel=<id>`), never records or notes; recipients still need their own access.
Below the parcel zoom level a "Zoom in to see parcel boundaries" button appears.
Fullscreen depends on browser support. Existing measurement and IndexedDB offline-area
flows remain.

Hovering a parcel outlines it and labels its address (from the vector tile; tiles are
requested with `schema=2` so older cached tiles without addresses are skipped).
Clicking the selected parcel reopens its details; clicking an empty spot clears it.

Keyboard shortcuts outside text fields: `/` search, `M` measure, `S` projects, and
`Escape`, which closes an open popover, then the panel, then clears the selection.
Native dialog focus trapping is used for the brief preview; property tabs support
left/right arrow navigation. Reduced-motion preferences suppress interface animations.
Text colors meet 4.5:1 contrast on their backgrounds, and interface text is at least
12px (body copy 13px), except map attribution. Phones show a shorter footer disclaimer
that keeps every element of the full text; the full text stays on larger screens, in
the printed brief, and in CSV exports.

## Usability pass verification (Oct 2026)

- TypeScript, ESLint, 34 tests (including address formatting, mailing hints, and the
  site address in vector tiles), and the production build with bundle verification.
- The address formatter and mailing hint were run over a random 40,000-parcel sample of
  the encrypted dataset to check real county formats.
- New routes exercised against the configured backend: lookup by ID, tag/note/project
  edits, invalid input (400), unknown IDs (404), and deletes. A uniquely named test
  project was created and deleted, and its retained snapshot removed, leaving the
  existing projects unchanged.
- Headless Chromium at 1280 × 800 and iPhone 13 size: zoom prompt, typeahead, ID
  selection and `?parcel=` links, hover label, click/Esc behavior, one-click save and
  project menu, note edit/delete, tag change, project rename/delete, match labels,
  result pins (pin 1 opens result 1), mailing filters, layers popover and Esc,
  remembered basemap and recent parcels, mocked-location Locate, phone footer height,
  and no horizontal overflow. No page or console errors.

## Earlier local verification

- TypeScript and ESLint.
- Production build, including the repository's deployment-bundle verification.
- 14 tests across parcel presentation/export, immutable parcel reader, and the
  ArcGIS paging fixture. `npm run test:ui` runs the seven presentation/export tests.
- Browser review at 1280 × 720 and 390 × 844, including real parcel search,
  selection/highlight, satellite imagery, responsive camera padding, comparison,
  result sorting/acreage filters, saved-project filtering, distance/undo/clear,
  note draft retention and the printable-brief preview.
- Real save/tag/note round trip through the local app and configured backend;
  the uniquely named verification project and its test save/note were removed
  after checking their exact contents.
- A downloaded single-parcel CSV was parsed and checked for the correct parcel,
  all 15 columns, provenance, and the disclaimer.

The native print dialog/PDF file, device geolocation permission, and a physical
phone's fullscreen/offline behavior were not exercised. This is local verification;
production publishing and post-deployment verification are separate steps.

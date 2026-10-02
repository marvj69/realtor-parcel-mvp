# Parcel workspace UI

This UI uses the existing MapLibre, Next.js, encrypted immutable parcel assets,
and Neon accounts/projects/notes architecture. It adds no services, changes no
schema, and performs no bulk import. The basemaps are unchanged: a no-key USGS
Topo raster and State of Michigan imagery (see "Map styling" for how Topo is
presented).

## Layout modes

The workspace picks one of two layouts, once, in `src/lib/layout-mode.ts`, and
exposes it as `data-layout` on `.map-layout`. CSS and JavaScript both read that
single decision, so they cannot disagree.

| Mode | When | Shape |
| --- | --- | --- |
| `side` | 960px and wider, and landscape phones | Header, navigation rail, side panel, map, disclaimer footer. Landscape phones (height ≤ 520px) keep this layout with an icon-only rail and trimmed controls. |
| `sheet` | Under 960px wide (phones, portrait tablets) | Header, full-screen map, disclaimer, bottom navigation. The panel is a bottom sheet over the map. |

The shell is a CSS grid (`src/styles/shell.css`). Every map overlay is
`position: absolute; grid-area: map`, so offsets are measured from the map
itself and never from a magic header/footer height.

### Bottom sheet (phones and portrait tablets)

The sheet has three snap heights (`src/lib/sheet.ts`):

- **peek** – the header plus the first thing a person needs (the search box, a
  property summary with its actions, a live measurement). The map stays the
  main surface. Content below the peek fades out.
- **half** – about 58% of the map area.
- **full** – the whole map area, for long lists and forms.

Each tool opens at its own default (Explore, Projects, Compare and Offline at
half; Property and Measure at peek). Selecting a parcel on the map or from a
result opens Property at peek so the outlined parcel stays visible above it.
Phones start on the map with the sheet closed.

Drag the header up or down to snap to the nearest height (a quick flick projects
the release velocity; velocity is clamped so a bad sample cannot throw the
sheet); drag below the peek to close it; tap the header to cycle heights; or use
the chevron button. Focusing a text field raises the sheet to full so the
keyboard never covers it. While dragging, heights are written straight to the DOM
so panels do not re-render on every frame.

The sheet publishes its height as the `--sheet-covered` CSS variable on the
layout. The scale bar and attribution ride on top of it, so map attribution is
always visible, and `getSelectedParcelCameraPadding` in `ParcelMap.tsx` reads the
sheet's *target* height (not its mid-animation height) so a selected parcel is
centered in the visible part of the map.

## Working surfaces

The desktop navigation rail opens Explore, Property, Projects, Compare, Measure,
and Offline; closing a panel gives the map the full width. On phones the same
tools are in a bottom navigation bar and open in the sheet above.

Explore searches the existing ranked API as you type (Enter also searches). The
top 50 returned records can be filtered by county, recorded acreage, source
land-use/class, and the mailing-address hint, then sorted by relevance, address,
acreage, or assessment. Filters are an icon toggle that shows how many are
active. These are explicitly result-set filters; they do not filter every parcel
in the dataset. Missing numeric data does not pass an acreage filter, and zero
remains distinct from missing data. Each result says why it matched (owner,
address, APN, ...). The listed results appear as numbered pins on the map while
Explore is open; the map button fits them in view. Market shortcuts move the map
without inventing parcel records. A search with no matches shows a plain
explanation instead of an empty panel.

The header search (desktop and tablets) is a typeahead over the same API: arrow
keys and Enter pick a result, and "See all" opens Explore with its filters. On
phones the header shows a search pill that opens Explore with the keyboard ready.

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

Property leads with the address, county and parcel ID, then the actions (Save,
Compare, fit on map) so the primary action is never below the fold. Beneath that
are the saved-in chips, a boundary-shape preview with recorded acreage and
assessed value, and overview, save & notes and provenance tabs. The Save button
saves to the last-used project in one click; its menu saves to another project or
creates one (a bottom sheet on phones). Once saved, the button reads "Saved" and
chips show each project and tag. Save & notes lists every project the parcel is
in with its tag, its notes (edit/delete), and Remove from project. The tab
content also has an original-source link when available, structured workflow
tags, notes, CSV export, and a printable brief preview. Source dates are
formatted in UTC to preserve the source calendar day. Assessment is not presented
as market value. The printed brief includes provenance and the full disclaimer.
Use Print / Save PDF in a browser with print support; the preview remains usable
in embedded browsers whose host does not implement a native print dialog.

Selecting a parcel automatically calculates approximate acreage, boundary
perimeter in feet, and consecutive boundary dimensions from its available
geometry using Turf geodesic measurements. These appear as stat tiles in the
Overview tab beside the unchanged recorded acreage, and in full in the printable
brief. On screen the explanation sits behind an "Approximate GIS values, not a
survey" disclosure; the brief prints it in full. Dimensions read `175 × 120 × 65 ft`,
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
matches loaded project/client names, addresses, APNs, owners, and note text, and
workflow tags filter with one tap. The list loads up to 50 projects with up to 100
saved parcels each, and labels that limit. CSV exports contain the displayed
public parcel records and provenance, not private notes. Formula-like source text
is escaped for spreadsheet safety.

This browser remembers (localStorage, per device): map settings (basemap, layers,
fill opacity), the last-used project, and up to eight recently viewed parcels'
public-record fields. Explore has a Clear button for recently viewed parcels. A
remembered project that was renamed or deleted elsewhere falls back to the newest
project.

## Map controls and styling

A basemap switch (Map / Satellite) sits at the top-left. The control column at the
top-right holds Layers, Locate, Copy link, Home market and Fullscreen, followed by
MapLibre's zoom and compass, mounted into the same column so every control shares
one look. On phones, Home and Fullscreen are omitted; on touch screens the zoom
buttons are hidden (pinch instead) and the compass appears only once the map is
rotated or tilted. Layers controls parcel boundary visibility, the saved-parcel
layer (points colored by workflow tag, visible at every zoom), parcel fill
opacity, and satellite road/place labels, with a legend.

Locate asks for the device location, selects the parcel there (or the downloaded
offline parcel when offline), and reports GPS accuracy with a reminder that GPS
and parcel lines are both approximate. It replaces MapLibre's built-in geolocate
control, which duplicated it. Location requires normal browser permission. Copied
links keep zoom/center/bearing and the selected parcel ID (`?parcel=<id>`), never
records or notes; recipients still need their own access. Below the parcel zoom
level a "Zoom in to see parcel boundaries" button appears. Fullscreen depends on
browser support. Existing measurement and IndexedDB offline-area flows remain.

There is no always-on status chip. Loading shows a thin progress bar along the top
of the map; errors and measure mode show a banner; one-off feedback ("No parcel
record was found at that spot.") appears as a toast.

Hovering a parcel outlines it and labels its address (from the vector tile; tiles are
requested with `schema=2` so older cached tiles without addresses are skipped).
Clicking the selected parcel reopens its details; clicking an empty spot clears it.

### Map styling

All parcel colors live in `src/lib/map-theme.ts` and are applied in one function,
`paintParcelLayers` in `ParcelMap.tsx`, so a basemap or preference change cannot
leave layers disagreeing.

- **Map (USGS Topo):** the raster is desaturated so outlines carry the map, and past
  the source's native detail (z16) it fades toward the neutral map background
  instead of showing blurry, magnified labels. Parcel outlines are deep slate-teal.
- **Satellite:** outlines are white with a dark casing for contrast over bright
  roofs and snow.
- **Outlines sharpen with zoom.** At the first parcel zoom they are a faint texture
  and they strengthen over four zoom levels, so dense towns are not a solid mesh.
- **Selected parcel:** warm orange fill and line with a halo, on both basemaps.

## Design system

Styles are split by concern in `src/styles/` and imported in cascade order from
`src/app/globals.css`: `tokens` → `base` → `components` → `shell` → `map` →
`panels` → `print`.

- **Tokens** (`tokens.css`) hold every color, type size, radius, shadow, motion
  curve and layout size. Neutrals carry a slight green undertone; the brand is a deep
  lake green and the selection accent is orange. Use tokens, not literal values.
- **Type:** Geist and Geist Mono via `next/font`, downloaded at build time and
  self-hosted (no runtime request to a font CDN). Parcel IDs, APNs and
  coordinates use the mono face.
- **Icons:** Lucide glyphs (ISC license) inlined in `Icon.tsx`; there is no runtime
  dependency.
- **Brand:** the mark (`Brand.tsx`) is a small plat of lot lines with one lot
  selected, matching the product's core interaction. The favicon, home-screen icons
  and share image are generated from it.
- **Interaction sizes:** controls are 40px, or 44px on touch (`pointer: coarse`).
  Inputs are 16px on small screens so iOS does not zoom the page on focus.
- **Responsive panels:** the panel is a size container, so the Compare button
  collapses to its icon in a narrow panel rather than truncating the Save button.
- **Motion** respects `prefers-reduced-motion`.

Keyboard shortcuts outside text fields: `/` search, `M` measure, `S` projects, and
`Escape`, which closes an open popover, then the panel, then clears the selection.
Native dialog focus trapping is used for the brief preview; property tabs support
left/right arrow navigation. Every control has a visible focus ring, and the map
shows an inset ring when it has keyboard focus. Text colors meet 4.5:1 contrast on
their backgrounds, and interface text is at least 12px (body copy 13–14px), except
map attribution. Phones show a shorter footer disclaimer that keeps every element
of the full text; the full text stays on larger screens, in the printed brief, and
in CSV exports. The disclaimer is always visible and must not be removed.

## Installable app and metadata

The app has a web manifest (`src/app/manifest.ts`), favicon, Apple touch icon,
maskable icons and a link-preview image, so phones can add it to the home screen
and shared links unfurl with the brand. Pages are marked `noindex` and
`robots.txt` disallows crawling, because parcel data is for private use. Parcel
numbers are protected from iOS phone-number auto-linking. Branded 404 and error
pages replace the framework defaults.

## Visual redesign verification (Oct 2026)

- TypeScript, repo-wide ESLint, 34 tests, and the production build including the
  repository's deployment-bundle verification.
- axe-core (WCAG 2.0/2.1 A and AA plus best practices) on desktop Explore, results,
  Property (both tabs), Projects and the layers popover; the phone map and Explore
  sheet; and sign-in: no violations.
- Headless Chromium at 1920 × 1080, 1440 × 900, 1180 × 760, an 820 × 1100 tablet,
  iPhone 13 (390 × 844), a 360 × 640 phone and an 844 × 390 landscape phone: no
  horizontal overflow and no console errors in start, search results and property
  states.
- Bottom-sheet behavior asserted in the browser: closed on phone load, default
  heights, drag snapping to full / half / peek, closing below the peek, tap-to-cycle,
  Property opening at peek on a map tap, field focus raising the sheet, the
  attribution sitting above the sheet, and `--sheet-covered` tracking its height.
- Saved-work screens were exercised against mocked API responses built from real
  parcel records, so no data was written to Neon. Sign-in, create-account, error,
  loading and account-menu screens were exercised with a mocked session endpoint.

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
phone's fullscreen/offline behavior were not exercised. Sheet dragging was
verified with pointer events (mouse input in an emulated phone), not with a finger
on physical hardware. This is local verification; production publishing and
post-deployment verification are separate steps.

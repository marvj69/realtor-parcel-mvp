# Parcel workspace UI

This refresh uses the existing MapLibre, Next.js, encrypted immutable parcel assets,
and Neon accounts/projects/notes architecture. It adds no services or dependencies,
changes no schema, and performs no bulk import.

## Working surfaces

The desktop navigation rail opens Explore, Property, Projects, Compare, Measure,
and Offline. Closing a panel expands the map. On phones, these tools use bottom
navigation and a scrollable panel with expand/reduce controls.

Explore searches the existing ranked API. The top 50 returned records can be
filtered by county, recorded acreage, and source land-use/class, then sorted by
relevance, address, acreage, or assessment. These are explicitly result-set
filters; they neither filter every parcel in the dataset nor restyle the map.
Missing numeric data does not pass an acreage filter, and zero remains distinct
from missing data. Market shortcuts move the map without inventing parcel records.

Property includes a boundary-shape preview drawn from the selected geometry,
overview and provenance tabs, an original-source link when available, structured
workflow tags, notes, CSV export, and a printable brief preview. Source dates are
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

Recent selections, comparisons (maximum three), and unsaved notes live only in
page memory. Switching panels preserves note drafts. Reloading discards them;
Save to project persists notes and tags through the existing API. Project search
matches loaded project/client names, addresses, APNs, owners, and note text. The
list loads up to 50 projects with up to 100 saved parcels each, and labels that
limit. CSV exports contain the displayed public parcel records and provenance,
not private notes. Formula-like source text is escaped for spreadsheet safety.

The map toolbar controls topo/satellite basemaps, parcel boundary visibility,
parcel fill opacity, and satellite road/place labels. MapLibre supplies compass,
location, and imperial scale controls. Location requires normal browser permission.
Copy map link retains zoom/center/bearing in the URL, without including parcel
records or notes. Recipients still need their own access. Fullscreen depends on
browser support. Existing measurement and IndexedDB offline-area flows remain.

Keyboard shortcuts outside text fields: `/` search, `M` measure, `S` projects,
`Escape` map only. Native dialog focus trapping is used for the brief preview;
property tabs support left/right arrow navigation. Reduced-motion preferences
suppress interface animations.

## Local verification

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

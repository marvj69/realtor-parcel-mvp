# Parcel data refresh — September 7, 2026

The configured public feeds were rechecked against dataset `20260905170024088`.
Eight sources were refreshed; seven had no substantive changes in their configured
feeds. A newer service timestamp alone was not treated as a newer assessor roll.
The MTU public service catalogue did not list a newer Houghton annual parcel layer.
Houghton remains the 2024 feed; its county website now directs users to Beacon.

New encrypted dataset: `20260908000111344` — **230,386 map features** across 15
sources. This is 1,805 fewer features, reflecting upstream consolidation/revisions
and exclusion of 12 records that collapse to empty geometry after validation.

| Source | Previous | Refreshed | Existing IDs retained | Changed mapped details |
| --- | ---: | ---: | ---: | ---: |
| `alger-mi-colligo` | 12,625 | 12,622 | 12,601 | 8,829 |
| `baraga-mi-public` | 10,884 | 10,884 | 10,884 | 0 |
| `delta-mi-fetchgis` | 22,528 | 22,534 | 22,479 | 2 |
| `dickinson-mi-colligo` | 26,484 | 24,557 | 24,476 | 600 |
| `escanaba-mi-public-mapguide` | 5,611 | 5,610 | 5,610 | 3 |
| `gladstone-mi-colligo` | 2,767 | 2,767 | 2,767 | 0 |
| `gogebic-mi-public` | 6,681 | 6,681 | 6,681 | 0 |
| `houghton-mi-2024` | 28,602 | 28,602 | 28,602 | 0 |
| `iron-mi-public` | 20,427 | 20,427 | 20,427 | 16,144 |
| `keweenaw-mi-2024` | 4,759 | 4,759 | 4,759 | 0 |
| `marquette-city-mi-public` | 6,718 | 6,718 | 6,718 | 0 |
| `marquette-mi-fetchgis` | 39,536 | 39,530 | 39,497 | 32,240 |
| `menominee-mi-colligo` | 23,958 | 24,084 | 23,897 | 21,106 |
| `ontonagon-mi-public` | 7,118 | 7,118 | 7,118 | 0 |
| `schoolcraft-mi-2024` | 13,493 | 13,493 | 13,493 | 0 |

“Changed mapped details” compares normalized parcel ID, owner, address, acreage,
assessment, land use and legal-description fields for retained UUIDs. It does not
count raw-only attribute changes, new features or geometry changes.

## Source and import findings

- Tile URLs include the deployment dataset version, so a new release does not
  reuse browser-cached outlines from the prior dataset after the app is reopened.
- Current source URLs and field mappings are in
  `config/upper-peninsula-county-sources.example.json`; Houghton's existing local
  config remains unchanged. All 15 feeds were downloaded for comparison.
- Delta's current layer uses `Parcel_PIN` and regenerated its feature IDs. The
  field mapping now supports that name. It remains a boundary/parcel-number layer,
  without owner or assessment data.
- Marquette exposes a revised schema and updated assessment/owner records. One
  source row lacks polygon geometry. The fetcher previously advanced pagination
  by converted polygons, repeating a boundary record; it now counts source rows.
- Colligo updates include current assessment and source attributes. Several
  layers reassigned `ogr_fid`, so identity was established with parcel numbers
  and geometry, not feature ID alone.
- Dickinson's feature count fell by 1,927, while distinct nonempty parcel numbers
  increased from 22,834 to 22,841. Only four prior reference locations were
  uncovered. The reduction was reviewed as upstream consolidation/revision.
- Excluded empty polygons: Marquette county 9, Menominee 2, Escanaba 1. Their fresh
  input records remain in the ignored audit download and their prior records
  remain recoverable from the previous encrypted release.
- Original attributes are retained in the encrypted recovery archive. Existing
  private/internal source-use notes and map disclaimers remain in effect.

## Validation

- All 6 existing saved parcel UUIDs remain in the refreshed dataset.
- 230,009 existing UUIDs retained (see per-source table); newly unmatched features
  receive new UUIDs. Duplicate parcel numbers required geometry disambiguation.
- Every prior location in the eight refreshed sources was checked against current
  polygon coverage: 20 of 153,936 reference points were not covered within about
  0.1 metre. These are differences in the fetched source coverage; the check found no wholesale county coverage loss.
- Refreshed sources contain no invalid or empty polygons after repair/exclusion.
  The seven unchanged source copies retain their prior geometries, including 68
  pre-existing invalid geometries; this refresh does not claim to correct them.
- AES-GCM decryption, SHA-256 checksums and SQLite integrity checks cover both
  the complete runtime dataset and the original-attribute archive.
- 45 sampled lookup/search/bbox comparisons across all 15 sources passed against
  scratch PostGIS, with deterministic handling of identical overlapping parcels.
- Typecheck, lint, all 7 tests, production build and deployment-bundle checks passed.
  Every function stays under 250 MiB; no private files enter the bundle.
- Regression tests cover pagination with a missing-geometry record and the
  existing static lookup, search, bbox, tiles and read-only storage behavior.

The detailed local audit, source responses, raw downloads and scratch comparison
are under ignored `work/parcel-refresh-20260907/`. No user data or encryption keys
are included in Git or public files. The prior encrypted release and its retained
Neon key support rollback.

## Public source references

- [Houghton County Equalization and current GIS links](https://houghtoncounty.net/directory-equalization.php)
- [MTU public GIS service catalogue](https://portal1-geo.sabu.mtu.edu/server/rest/services/Hosted)
- [Colligo public county/city sites](https://colligogis.com/public/)
- [Escanaba public GIS notice and guest access](https://gis.escanaba.org/)
- [Schoolcraft County Equalization](https://www.schoolcraftcounty.net/departments/equalization)

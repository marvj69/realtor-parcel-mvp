# Performance verification

## Satellite loading — September 9, 2026

Satellite and parcel sources previously initialized on MapLibre's `load` event,
which waits for the initial visible map to load. A slow USGS topo tile therefore
blocked satellite switching and parcel outlines. Sources now initialize on
`style.load`, before raster tile completion. The GeoJSON fallback also fetches
after its viewport debounce without waiting for unrelated imagery to become idle.
See [MapLibre map events](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/MapEventType/).

The initial satellite view gives imagery priority over the two reference-label
overlays. Labels begin after the visible base imagery tiles complete, then remain
available for subsequent pans and switches. Optional high-zoom detail imagery
keeps the base underneath while loading and overzooms from its source's native
maximum rather than disappearing at that zoom.

Turning parcel boundaries off now hides the corresponding layers and pauses
GeoJSON requests. Previously only paint opacity changed, so invisible vector
tiles continued to download and process. Restoring boundaries resumes loading.
Selection highlights, source attribution, and the boundary disclaimer remain.

### Measurements and limits

The controlled browser check holds every topo tile indefinitely. Before the fix,
neither imagery nor parcel requests began during a three-second hold; the first
imagery request began 3.42 seconds after clicking Satellite, after releasing topo.
On the optimized local build after the fix, imagery requests began about 0.18–0.49
seconds after clicking while topo was still held. Both vector and GeoJSON parcel
requests started independently. These are request-start timings, not full-render
or production latency claims. Fixtures isolate this test from public-service speed.

Both parcel modes made **zero** new parcel requests when moving from Houghton to
Marquette with boundaries hidden, and resumed requests when re-enabled. Labels
made no requests while the initial imagery was held and loaded when released.

Live provider sampling returned Michigan imagery tiles in approximately 0.37–0.58
seconds at zooms 13, 16, and 19. One USGS topo tile took 10.41 seconds. Actual browser
first-imagery response measurements also varied between runs (approximately 0.65
and 6.84 seconds). Provider/network latency is still variable; this change removes
the app's dependency on topo completion, not delays within the imagery service.
The existing public providers, tile resolution, private-data architecture, and
operating-cost model are unchanged.

The read-only backend check used Node 24.18.0 and dataset `20260908000111344`
(230,386 parcels). Sampled cached searches took 0.002–0.16 ms and cached tiles
0.001–0.04 ms. Geometry open took 667 ms, search-asset open 161 ms, and first dense
z13 tiles 83–92 ms. Two-character and non-indexable searches still require scans
(about 315–325 ms here) to preserve matching behavior. These are local CPU/asset
timings; no backend regression or need for a new paid service was found.

### Reproduce

Use Node 24 and the existing private local environment. Run `npm run build`, then
`npm run start -- --hostname 127.0.0.1 --port 3100`. Install the test browser once
with `npx playwright install chromium`, then run `npm run test:map` in another
terminal. The browser check expects the default public basemaps and a local server
with the static parcel dataset available. It makes only read requests to parcel
APIs; public map tiles are deterministic image fixtures. It also exercises the
GeoJSON path by changing the session response's vector-capability flag in that
isolated test context.

`PARCEL_MAP_TEST_URL` overrides the local URL. For a protected local server,
`PARCEL_MAP_TEST_STORAGE_STATE` can point to a private Playwright session file;
keep it outside Git. Results are written to ignored
`work/map-loading-verification.json`. Optional `PARCEL_MAP_TEST_CDP_URL` connects
to a dedicated existing test browser. Live imagery must be checked separately.

Validation: 24 tests, lint, typecheck, and the production build/bundle checks pass.
Browser regression checks pass on both development and optimized local builds.
Real-provider checks on the optimized build covered desktop/mobile satellite
imagery, reference labels, owner search, parcel details, and selection highlights.
Local measurements are not a production deployment verification.

## Search and storage — September 7, 2026

Measured with Node 24.18.0 on the same Mac and the unchanged 230,386-parcel dataset
`20260908000111344`. These are local server CPU timings, not promises about network
latency or Vercel cold starts. Basemap imagery remains dependent on public providers.

| Work | Before | After |
| --- | ---: | ---: |
| Houghton search, first query | 199 ms | 10.0 ms |
| Lake Linden search, first query | 193 ms | 4.1 ms |
| Heinonen search, first query | 193 ms | 1.3 ms |
| Normalized APN search, first query | 208 ms | 0.6 ms |
| Repeated common searches, median of 5 | 191–207 ms | 0.05–0.13 ms |
| Repeated Houghton / Marquette z13 tiles, median of 5 | 71–74 ms | 0.014–0.015 ms |
| Search function traced files | 177 MiB | 54 MiB |
| Extra bbox/count requests on vector-map pans | 1 per settled view | 0 |

The initial sign-in page deferred the approximately 274 KB compressed MapLibre
chunk: measured script transfer fell from about 451 KB on the prior production
page to 169 KB locally (about 62%). Confirm transfer size on production when
releasing; compression and transport differ between hosts.

The first uncached tile still needs geometry decoding and generation (about
87–105 ms in this run). A first two-character search still scans the compact table
(about 197 ms in this run). Subsequent identical queries/tiles benefit from bounded
instance caches. Cache eviction, instance restarts, authentication, and network
latency remain part of real end-to-end time.

## Changes

- Encrypted search-only SQLite asset with a contentless trigram index. The index
  narrows candidates; the original literal checks and scoring determine results.
  Search functions no longer unpack the geometry dataset. See
  [SQLite FTS5 trigram documentation](https://www.sqlite.org/fts5.html#the_trigram_tokenizer).
- Bounded per-instance caches: 128 searches / 4 MiB and 256 tiles / 16 MiB.
- Streaming SHA-256 verification avoids a second complete read during extraction.
- MapLibre loads after successful access checking. The browser reads tile-source
  events for loading status, avoiding count requests. Vector tiles overzoom from
  z18; selected parcels still use original full geometry.
- Superseded lookups abort. Offline records load when their panel opens. Boundary
  SVGs are memoized while the selected parcel is unchanged.
- Node 24 CI now runs tests and the production build, including bundle validation.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass. The build
checks required dataset parts, excludes unrelated encrypted assets and private
files, tests the isolated Next launcher, and enforces the 250 MiB function limit.

Search parity: 79 queries drawn from all 15 real sources returned exactly the same
ranked records and public fields as the original scanner. Automated fixtures also
cover short queries, Unicode, literal punctuation, normalized APNs, numeric zero,
limits, cache eviction, and mutations of returned cache values. Tile bytes at the
same z/x/y matched the baseline.

Local browser verification covered sign-in, desktop/mobile layouts, topographic
and satellite maps, search and selection, and offline download/view/delete.
The authenticated API flow verified search, lookup, bbox, vector tiles, saving
with a note, projects, account isolation, and unknown-parcel rejection. Temporary
test accounts and any newly created unsaved verification snapshot were removed.

Reproduce server measurements with `npm run parcels:benchmark` using the existing
private `.env.local`. `npm run parcels:build-search` rebuilds the encrypted search
asset without importing data into Neon. The parcel-data refresh/recovery runbook
is [STATIC_PARCELS.md](STATIC_PARCELS.md).

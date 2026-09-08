# Performance verification — September 7, 2026

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

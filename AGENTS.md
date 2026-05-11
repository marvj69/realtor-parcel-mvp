# Agent Instructions

You are the autonomous coding agent for the Realtor Parcel MVP.

Your job is to turn this starter into a working, deployable MVP for a small group of realtors. Work incrementally, verify each step, and keep the app low-cost.

## Product goal

Build a local-first parcel intelligence map for realtors.

The MVP should let a realtor:

1. Open an interactive map.
2. Search or pan around a local market.
3. Tap/click a parcel.
4. See approximate public-record parcel details.
5. Save the parcel to a project/client folder.
6. Add notes.
7. Eventually export a simple property brief.

## Hard constraints

- Use the existing stack: GitHub, Vercel, Neon.
- Use MapLibre for mapping.
- Use Neon Postgres with PostGIS for parcel geometry.
- Keep operating cost near-free.
- Do not use Regrid, ATTOM, Mapbox, Google Maps, or other paid APIs unless the owner explicitly authorizes it.
- Do not fabricate parcel data.
- Do not treat parcel boundaries as surveys.
- Keep legal/survey disclaimers visible in the UI.
- Keep secrets out of GitHub.
- Prefer public county/state GIS data sources.

## Source-of-truth files

Read these before making changes:

```txt
README.md
TODO.md
docs/MVP_SPEC.md
docs/DATA_SOURCE_PLAYBOOK.md
docs/DISCLAIMERS.md
db/schema.sql
```

## Preferred implementation order

### Phase 0 — Verify the scaffold

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Confirm `DATABASE_URL` is present.
4. Run `npm run typecheck`.
5. Run `npm run db:schema`.
6. Run `npm run db:seed`.
7. Run `npm run dev`.
8. Confirm the app loads and the health endpoint works.

### Phase 1 — Make the map/parcels flow reliable

1. Confirm MapLibre renders with the configured style URL.
2. Confirm `/api/parcels/bbox` returns a GeoJSON FeatureCollection.
3. Confirm visible parcel outlines load when zoomed in.
4. Confirm `/api/parcels/lookup?lat=&lng=` returns the clicked parcel.
5. Confirm the selected parcel highlight updates correctly.
6. Improve error handling for empty DB / missing env / invalid bbox.

### Phase 2 — Import the first real county

1. Pick one county first, preferably the user's main market.
2. Locate the public parcel GIS source.
3. Verify the data source terms/disclaimers.
4. Add a source entry to `config/county-sources.local.json`.
5. Fetch the ArcGIS layer or download a GeoJSON/shapefile and convert it to GeoJSON.
6. Import into Neon/PostGIS using `scripts/import-parcels-from-geojson.ts`.
7. Validate row counts and map rendering.
8. Document field mappings and source date.

### Phase 3 — Realtor workflow

1. Add a project sidebar.
2. Add saved parcel list.
3. Add parcel notes.
4. Add manual tags: `lead`, `showing`, `listing-prospect`, `cma`, `follow-up`.
5. Add simple export/print view.

### Phase 4 — Search and filtering

1. Improve `/api/parcels/search`.
2. Add address/owner/APN search box.
3. Add filters for acreage, land use, and absentee-owner hints when fields exist.
4. Avoid assumptions when county fields are missing.

### Phase 5 — Production readiness

1. Add authentication if this will support multiple real users.
2. Add rate limiting to API routes.
3. Add error reporting/logging.
4. Add import job logging.
5. Add tests for geometry lookup and import normalization.
6. Add Vercel environment variable documentation.

## Engineering style

- Make small commits.
- Prefer simple code over clever abstractions.
- Keep county-specific weirdness in config or normalization helpers, not scattered across the app.
- Use TypeScript types for API responses.
- Return GeoJSON for map layers.
- Avoid huge API responses. Use bbox limits and zoom thresholds.
- Add comments only where the logic is not obvious.

## Data rules

Parcel data can be incomplete or stale. Always track:

```txt
source_id
provider
source_county
state
source_url
source_updated_at when known
imported_at
raw source attributes
```

Every county source needs its own field mapping. Do not assume `OWNER`, `PARCEL_ID`, or `ACRES` will exist.

## UI disclaimer requirement

The map UI must display language substantially equivalent to:

> Parcel boundaries and property data are approximate and provided for general reference only. They are not a legal survey, title opinion, zoning determination, or substitute for county/municipal verification.

Do not remove this disclaimer.

## Definition of done for first deploy

- App deploys on Vercel.
- Neon database schema is applied.
- At least one demo or real parcel source works.
- Parcel click lookup works.
- Parcel boundary highlight works.
- Save parcel to project works.
- No secret values committed.
- UI includes parcel-boundary disclaimer.

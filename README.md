# Realtor Parcel MVP

A low-cost, local-first MVP for a realtor-focused parcel intelligence map.

This starter is designed for GitHub + Vercel + Neon and gives a coding agent enough structure to begin building immediately.

## What this MVP does

- Displays an interactive MapLibre map.
- Uses a no-key USGS Topo raster basemap by default.
- Adds a satellite/aerial imagery toggle using a configurable public raster tile source.
- Looks up parcels from a Neon/PostGIS database by map click.
- Loads visible parcel outlines by map bounding box.
- Shows a parcel details drawer.
- Saves parcels to a lightweight project table.
- Saves selected map areas to browser storage for offline parcel review.
- Includes import scripts for public GIS parcel GeoJSON / ArcGIS FeatureServer data.
- Includes agent instructions, data-source playbook, schema, todo list, and deployment notes.

## Stack

```txt
Next.js App Router
React
MapLibre GL JS
Neon Postgres + PostGIS
Vercel
pg
Turf.js
TypeScript
```

## Repository structure

```txt
.
├── AGENTS.md
├── TODO.md
├── PROMPT_FOR_CODEX.md
├── README.md
├── config/
│   └── county-sources.example.json
├── data/
│   └── parcels/.gitkeep
├── db/
│   ├── schema.sql
│   └── seed.sql
├── docs/
│   ├── DATA_SOURCE_PLAYBOOK.md
│   ├── DATA_REFRESH_SCHEDULE.md
│   ├── DEPLOYMENT.md
│   ├── DISCLAIMERS.md
│   ├── MVP_SPEC.md
│   └── ROADMAP.md
├── scripts/
│   ├── apply-schema.ts
│   ├── fetch-arcgis-layer.ts
│   └── import-parcels-from-geojson.ts
└── src/
    ├── app/
    ├── components/
    ├── lib/
    └── types/
```

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in your Neon connection string:

```bash
DATABASE_URL="postgresql://..."
```

For Vercel, use the pooled Neon connection string for runtime usage. If you add `DATABASE_DIRECT_URL`, use it only for scripts/migrations.

Street view defaults to a no-key USGS Topo raster service so the app does not
depend on a third-party vector basemap. Set `NEXT_PUBLIC_MAP_STYLE_URL` only if
you want to use a different authorized public MapLibre style URL.

Satellite view defaults to no-key USGS ImageryOnly raster services. The cached
tile layer handles normal zooms, and a WMS detail layer takes over when zoomed
in so imagery does not have to stretch z16 tiles. Override
`NEXT_PUBLIC_SATELLITE_TILE_URL` or `NEXT_PUBLIC_SATELLITE_DETAIL_TILE_URL` if
you prefer a different authorized public tile source. Set
`NEXT_PUBLIC_SATELLITE_DETAIL_TILE_URL` to an empty string to disable the
high-zoom detail layer.

Optional private-app auth is controlled by server-only env vars. Set `APP_AUTH_PASSWORD` and
`APP_AUTH_SESSION_SECRET` in Vercel to require a signed session cookie for saved projects/parcels.
Leave `APP_AUTH_PASSWORD` empty for local/demo open mode. When a Neon database is configured,
users can create their own email/password account without a shared workspace password.

### 3. Create database schema

```bash
npm run db:schema
```

### 4. Seed demo parcel

```bash
npm run db:seed
```

### 5. Run locally

```bash
npm run dev
```

Open the local app. The map is centered near Houghton, Michigan by default. Click near the demo parcel area after seeding.

## Import real parcel data

### Option A: Import a local GeoJSON file

1. Put a parcel GeoJSON file in `data/parcels/`.
2. Copy `config/county-sources.example.json` to `config/county-sources.local.json`.
3. Update the input file path and field mappings.
4. Run:

```bash
npm run parcels:import -- --config=config/county-sources.local.json --source=houghton-mi-example
```

### Option B: Fetch from an ArcGIS FeatureServer layer

1. Find the county parcel FeatureServer layer URL.
2. Add it to `config/county-sources.local.json`.
3. Run:

```bash
npm run parcels:fetch -- --config=config/county-sources.local.json --source=houghton-mi-example
npm run parcels:import -- --config=config/county-sources.local.json --source=houghton-mi-example
```

## Refresh parcel sources

Use the manual cadence and runbook in `docs/DATA_REFRESH_SCHEDULE.md` before
refreshing production parcel data. Do not enable automated data-source refreshes
until import-job logging and failure reporting are in place.

## Compact Neon parcel storage

Parcel imports preserve source attributes as gzipped JSON bytes so parcel details,
search, lookup, tiles, and future audits keep the same information with less
database storage. After upgrading an older database that still has legacy raw
JSONB storage, run:

```bash
npm run db:compact
```

The compaction script preserves parcel row counts by source, validates the
parcel count after the change, removes unused parcel indexes, and rebuilds the
indexes used by map lookup, vector tiles, and search. When the database has
enough free headroom, pass `-- --rewriteRaw` to rewrite an older parcel table so
legacy raw JSONB is replaced by compressed raw attributes.

## Important implementation notes

- Parcel boundaries are approximate public-record/GIS boundaries, not surveys.
- Do not imply legal boundary accuracy.
- Do not add paid APIs unless explicitly requested.
- Do not invent county data. Validate each county source and terms/disclaimers.
- Start with one county, then expand.

## First MVP acceptance criteria

The first useful version is done when an agent can:

1. Open the app.
2. See a base map.
3. Load parcel boundaries from the database.
4. Click a parcel.
5. See parcel ID/APN, owner, address, acreage, land use, and source.
6. Save that parcel to a project.
7. Add a note.
8. Deploy to Vercel using Neon.

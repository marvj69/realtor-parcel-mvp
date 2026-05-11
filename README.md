# Realtor Parcel MVP

A low-cost, local-first MVP for a realtor-focused parcel intelligence map.

This starter is designed for GitHub + Vercel + Neon and gives a coding agent enough structure to begin building immediately.

## What this MVP does

- Displays an interactive MapLibre map.
- Uses an OpenFreeMap style by default.
- Looks up parcels from a Neon/PostGIS database by map click.
- Loads visible parcel outlines by map bounding box.
- Shows a parcel details drawer.
- Saves parcels to a lightweight project table.
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

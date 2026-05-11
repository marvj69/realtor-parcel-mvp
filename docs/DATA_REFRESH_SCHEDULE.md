# Data Source Refresh Schedule

This MVP uses public county GIS parcel data. Refreshes should stay manual until import-job logging exists, so failures do not silently replace or partially update production parcel data.

## Operating cadence

| Source type | Metadata check | Full refresh | Notes |
| --- | --- | --- | --- |
| Active county ArcGIS FeatureServer | Monthly | Quarterly, or when the county publishes a new parcel roll | Preferred path for Houghton County and future county sources. |
| County downloadable GeoJSON/shapefile | Monthly | Quarterly, or when the download file changes | Record the download page, file date, and any visible terms changes. |
| State parcel layer | Quarterly | Semiannually, or when the state publishes a new vintage | Use only when county data is unavailable or stale. |
| One-time/demo source | Before demos | As needed | Never mix demo/fabricated records into a production county source. |

## Current source schedule

| Source key | County | Provider | Metadata check | Full refresh target | Triggered refresh |
| --- | --- | --- | --- | --- | --- |
| `houghton-mi-2024` | Houghton, MI | Houghton County / Colligo GIS public parcel layer | First business week of each month | First business week of January, April, July, and October | Refresh sooner if the county source date, feature count, field schema, or terms/disclaimer changes. |

## Monthly metadata check

1. Confirm the source URL still loads and still represents parcel boundaries.
2. Recheck the source terms, disclaimers, and any visible data-sharing restrictions.
3. Record any published source update date in `config/county-sources.local.json` as `sourceUpdatedAt`.
4. Compare source feature count with the current `parcel_sources` and `parcels` counts.
5. Check whether field names changed for parcel ID/APN, owner, site address, acreage, land use, and legal description.
6. Do not run a production import unless the source date, feature count, schema, or business need justifies it.

## Full refresh runbook

1. Update `config/county-sources.local.json` with the latest `sourceUrl`, `sourceUpdatedAt`, `notes`, field mappings, and refresh metadata.
2. Fetch the source into an ignored local file:

```bash
npm run parcels:fetch -- --config=config/county-sources.local.json --source=houghton-mi-2024
```

3. Inspect the downloaded feature count and spot-check raw properties before importing.
4. Apply schema updates first if the database has not been migrated recently:

```bash
npm run db:schema
```

5. Import into Neon/PostGIS:

```bash
npm run parcels:import -- --config=config/county-sources.local.json --source=houghton-mi-2024 --batchSize=500
```

6. Validate the refreshed source:

```bash
npm run typecheck
npm run lint
npm run build
```

7. Smoke-test `/api/health`, `/api/parcels/bbox?metadataOnly=1`, `/api/parcels/search`, `/api/parcels/lookup`, and the map click/highlight flow.
8. Confirm the UI still shows the parcel-boundary disclaimer.
9. Record the import date, source date, feature count, validation notes, and any source limitations in the project notes or release summary.

## Automation gate

Do not add a Vercel Cron or background refresh until these pieces exist:

- Import-job logging with started/succeeded/failed state.
- Row-count and source-key validation before old data is considered refreshed.
- Clear failure reporting.
- A way to prevent overlapping refreshes for the same `source_key`.
- A review step for source terms/disclaimers before automatically importing changed county data.

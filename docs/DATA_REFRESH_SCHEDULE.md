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
| `gladstone-mi-colligo` | Delta, MI | City of Gladstone / Colligo public GIS | First business week of each month | First business week of January, April, July, and October | Refresh sooner if the public project, 2026 assessment schema, feature count, or use terms change. Keep deployment private/internal unless broader reuse is confirmed. |

## Monthly metadata check

1. Confirm the source URL still loads and still represents parcel boundaries.
2. Recheck the source terms, disclaimers, and any visible data-sharing restrictions.
3. Record any published source update date in `config/county-sources.local.json` as `sourceUpdatedAt`.
4. Compare source feature count with the current `parcel_sources` and `parcels` counts.
5. Check whether field names changed for parcel ID/APN, owner, site address, acreage, land use, and legal description.
6. Do not run a production import unless the source date, feature count, schema, or business need justifies it.

## Full refresh runbook

The production Neon database contains user data and saved snapshots only. Do not
run bulk imports or the historical schema/seed workflow against it. Follow
[STATIC_PARCELS.md](STATIC_PARCELS.md) for the encrypted deployment architecture.

1. Review the current public source, field names, terms and update metadata.
   Download to a new ignored comparison directory, preserving prior source files.
2. Compare complete records with the deployed runtime and recovery archive.
   Service modification timestamps alone do not establish a newer assessor roll.
3. Restore the prior parcel dataset into a separate scratch PostGIS database.
   Explicitly set both `DATABASE_URL` and `DATABASE_DIRECT_URL` to scratch for
   imports; never let a missing scratch value fall back to `.env.local`.
4. Import changed sources in scratch and validate normalized fields, source counts,
   empty/invalid geometry, duplicate identifiers and coverage at prior locations.
5. Preserve parcel UUIDs by verified identity. If a provider regenerates OBJECTID
   or ogr_fid, match parcel numbers and geometry rather than reusing an ID for a
   different property. Review duplicate parcel numbers, splits and consolidations.
   Verify every existing saved parcel and keep saved snapshots intact.
6. Export the complete dataset with `PARCEL_KEY_DATABASE_URL` pointing to the small
   Neon backend. Review any intentional count reduction before using
   `--allow-smaller-dataset`. Keep the previous encrypted release and its key.
7. Verify runtime/archive checksums and integrity, source counts, sampled lookup,
   search, bbox and tiles against scratch. Run typecheck, lint, tests and build.
8. Deploy the complete manifest and matching encrypted chunks atomically. Verify
   the exact live dataset version, parcel count, authentication and map APIs.
9. Record source changes, excluded records, validation evidence and limitations.
   Compare user-data hashes before/after. Stop the temporary scratch server.

Latest review: [September 7, 2026 refresh](PARCEL_REFRESH_2026-09-07.md).

## Automation gate

Do not add a Vercel Cron or background refresh until these pieces exist:

- Import-job logging with started/succeeded/failed state.
- Row-count and source-key validation before old data is considered refreshed.
- Clear failure reporting.
- A way to prevent overlapping refreshes for the same `source_key`.
- A review step for source terms/disclaimers before automatically importing changed county data.

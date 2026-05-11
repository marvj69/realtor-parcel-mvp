# MVP Todo

## Now

- [x] Install dependencies.
- [x] Add `.env.local` from `.env.example` for local/demo configuration.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run `npm run dev`.
- [x] Confirm map renders with MapLibre and OpenFreeMap.
- [x] Confirm `/api/health` works in server-side demo mode.
- [x] Confirm demo parcel bbox and click lookup work.
- [x] Confirm selected parcel highlight and details drawer work.
- [x] Confirm save parcel API can be triggered in demo mode.
- [x] Replace placeholder `.env.local` `DATABASE_URL` with a real Neon PostGIS connection string.
- [x] Run `npm run db:schema` against Neon/PostGIS.
- [x] Run `npm run db:seed` against Neon/PostGIS.
- [x] Confirm `/api/health` reports real PostGIS mode, not demo fallback mode.
- [x] Deploy production app to Vercel.
- [x] Verify live map, parcel click lookup, and save API workflow.
- [x] Import full Houghton County 2024 parcel dataset into Neon for private app use.

## Parcel map MVP

- [x] Load visible parcels from `/api/parcels/bbox` only when zoomed in enough.
- [x] Click parcel and call `/api/parcels/lookup`.
- [x] Highlight selected parcel.
- [x] Show details drawer.
- [x] Show parcel ID/APN, owner, address, acreage, county/source, and import/source timestamps when available.
- [x] Trigger save selected parcel to a project through `/api/saved-parcels`.
- [x] Trigger private parcel note submission through `/api/saved-parcels`.
- [x] Persist saved parcels and notes after Neon schema is applied.
- [ ] Add search by APN/site address/owner.
- [ ] Add project sidebar.

## Data ingestion

- [x] Create ignored `config/county-sources.local.json` from example.
- [x] Identify first county GIS parcel source: Houghton County / Colligo GIS `Houghton_MI_Parcels_2024` FeatureServer.
- [x] Verify public source metadata and county data-sharing restrictions.
- [x] Fetch a small 25-feature ArcGIS FeatureServer sample, not the full county dataset.
- [x] Normalize source field mappings for the Houghton sample.
- [x] Import the small sample into Neon/PostGIS.
- [x] Record source URL and import date in `parcel_sources`.
- [x] Validate imported sample via `/api/parcels/bbox`, `/api/parcels/search`, and `/api/parcels/lookup`.
- [x] Fetch full Houghton County 2024 ArcGIS FeatureServer dataset: 28,602 features.
- [x] Import full Houghton County source into Neon/PostGIS under `houghton-mi-2024`.
- [x] Remove the 25-feature sample and fictional seed sources from Neon to avoid duplicate/fabricated production parcels.
- [x] Validate full source via production `/api/parcels/bbox`, `/api/parcels/search`, and `/api/parcels/lookup`.

## Realtor-specific features

- [ ] Saved parcel tags.
- [ ] Lead/prospecting notes.
- [ ] Showing notes.
- [ ] Basic printable property brief.
- [ ] Measurement tools for distance/area.
- [ ] Absentee owner hint when owner mailing address differs from site address.
- [ ] Simple acreage/land-use filters.

## Production

- [ ] Add authentication.
- [ ] Add per-user data ownership.
- [ ] Add rate limiting.
- [ ] Add import-job logging.
- [ ] Add faster tiled/vector parcel serving for dense full-county views.
- [ ] Add monitoring/error logging.
- [x] Add deployment environment variable documentation.
- [ ] Add data-source refresh schedule.

## Live deployment status

- Production URL: `https://realtor-parcel-mvp.vercel.app`
- GitHub repo: `https://github.com/marvj69/realtor-parcel-mvp`
- `main` is pushed to GitHub and Vercel production deploys from it.
- Neon/PostGIS is working in local and production API routes.
- Production Neon currently contains `houghton-mi-2024` with 28,602 Houghton County parcels.
- Demo fallback remains available when `DATABASE_URL` is missing or still a placeholder.

## Current blockers

- [ ] No authentication or per-user data ownership yet, so production use should stay private/internal.
- [ ] Search API exists, but the search box is not yet exposed in the UI.
- [ ] Project/sidebar workflow is still minimal; saved parcels persist through the API but are not listed in the UI yet.
- [ ] Dense Houghton city/area views can hit the current bbox cap and load large GeoJSON responses; optimize this before broader use.

## Next recommended tasks

- [ ] Add a visible APN/address/owner search box connected to `/api/parcels/search`.
- [ ] Add a saved-project sidebar that lists saved parcels and notes from Postgres.
- [ ] Add authentication and per-user project ownership before inviting multiple real users.
- [ ] Add a printable/exportable parcel brief for selected parcels.
- [ ] Optimize parcel rendering with smaller bbox caps, server-side simplification, or vector-tile style endpoints.

## Later

- [ ] MLS/RESO integration after proper approval.
- [ ] Zoning layers.
- [ ] Wetland/flood/topography layers.
- [ ] Photo pins.
- [ ] Offline/mobile field mode.
- [ ] CMA map mode.

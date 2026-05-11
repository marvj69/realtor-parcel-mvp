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
- [ ] Replace placeholder `.env.local` `DATABASE_URL` with a real Neon PostGIS connection string.
- [ ] Run `npm run db:schema` against Neon/PostGIS.
- [ ] Run `npm run db:seed` against Neon/PostGIS.

## Parcel map MVP

- [x] Load visible parcels from `/api/parcels/bbox` only when zoomed in enough.
- [x] Click parcel and call `/api/parcels/lookup`.
- [x] Highlight selected parcel.
- [x] Show details drawer.
- [x] Show parcel ID/APN, owner, address, acreage, county/source, and import/source timestamps when available.
- [x] Trigger save selected parcel to a project through `/api/saved-parcels`.
- [x] Trigger private parcel note submission through `/api/saved-parcels`.
- [ ] Persist saved parcels and notes after Neon schema is applied.
- [ ] Add search by APN/site address/owner.
- [ ] Add project sidebar.

## Data ingestion

- [ ] Create `config/county-sources.local.json` from example.
- [ ] Identify first county GIS parcel source.
- [ ] Verify public usage/disclaimer terms.
- [ ] Fetch ArcGIS FeatureServer layer or download parcel GeoJSON.
- [ ] Normalize source field mappings.
- [ ] Import into PostGIS.
- [ ] Record source URL and import date.
- [ ] Validate parcels on the map.

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
- [ ] Add monitoring/error logging.
- [ ] Add deployment checklist.
- [ ] Add data-source refresh schedule.

## First-pass blockers

- [ ] Real Neon/PostGIS `DATABASE_URL` is not configured yet. Database scripts now fail fast with a clear message instead of trying the placeholder URL.
- [ ] Docker is installed locally, but the Docker daemon was not running during verification, so a local PostGIS container could not be started.
- [ ] This folder is not currently initialized as a Git repository, so changes could not be committed from this pass.
- [ ] No real county parcel source has been validated or imported yet; the app is using clearly labeled demo parcel data only.

## Next recommended tasks

- [ ] Create/link the Neon database, enable PostGIS, set `DATABASE_URL`, then run `npm run db:schema` and `npm run db:seed`.
- [ ] Pick the first realtor market county and validate its public GIS parcel layer terms/disclaimers.
- [ ] Create `config/county-sources.local.json` with field mappings and import a small real parcel sample.
- [ ] Add a visible APN/address/owner search box connected to `/api/parcels/search`.
- [ ] Add a saved-project sidebar that lists saved parcels and notes from Postgres.

## Later

- [ ] MLS/RESO integration after proper approval.
- [ ] Zoning layers.
- [ ] Wetland/flood/topography layers.
- [ ] Photo pins.
- [ ] Offline/mobile field mode.
- [ ] CMA map mode.

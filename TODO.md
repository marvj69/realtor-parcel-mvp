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
- [x] Add zoom-aware parcel loading for dense Houghton County views.
- [x] Add server-side bbox geometry simplification and hard parcel-count caps.
- [x] Add APN/owner/site-address/mailing-address search panel UI.
- [x] Add Postgres trigram indexes for parcel search fields.
- [x] Verify local dense-view, search, click lookup, and save API smoke tests.
- [x] Add saved-project sidebar/list UI with saved parcel notes.
- [x] Add private-app sign-in/sign-out UI backed by server-only env vars.
- [x] Add database-backed create-account flow using the private workspace password.
- [x] Add vector-tile parcel layer for dense Houghton views.
- [x] Add API rate limiting and structured request logging.
- [x] Improve search ranking/autocomplete with APN prefix boosts.

## Parcel map MVP

- [x] Load visible parcels from `/api/parcels/bbox` only when zoomed in enough.
- [x] Return "zoom in" and "too many parcels" bbox responses instead of huge low-zoom GeoJSON payloads.
- [x] Simplify bbox parcel geometry by zoom level while keeping full detail for selected parcel lookup.
- [x] Click parcel and call `/api/parcels/lookup`.
- [x] Highlight selected parcel.
- [x] Show details drawer.
- [x] Show parcel ID/APN, owner, address, acreage, county/source, and import/source timestamps when available.
- [x] Trigger save selected parcel to a project through `/api/saved-parcels`.
- [x] Trigger private parcel note submission through `/api/saved-parcels`.
- [x] Persist saved parcels and notes after Neon schema is applied.
- [x] Add search by APN/site address/mailing address/owner.
- [x] Add project sidebar.

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

- [x] Add private-app password/session auth primitives.
- [x] Add per-user ownership for projects and saved parcels.
- [x] Add rate limiting.
- [ ] Add import-job logging.
- [x] Add geometry, source-key, APN/parcel-ID, owner, site-address, and mailing-address search indexes.
- [x] Add faster tiled/vector parcel serving for dense full-county views.
- [x] Add structured API request logging.
- [x] Add deployment environment variable documentation.
- [ ] Add data-source refresh schedule.

## Live deployment status

- Production URL: `https://realtor-parcel-mvp.vercel.app`
- GitHub repo: `https://github.com/marvj69/realtor-parcel-mvp`
- `main` is pushed to GitHub and Vercel production deploys from it.
- Neon/PostGIS is working in local and production API routes.
- Production Neon currently contains `houghton-mi-2024` with 28,602 Houghton County parcels.
- Latest Houghton performance/search pass adds zoom-aware loading, server-side simplification, hard bbox caps, and search UI.
- Auth/ownership pass adds `/api/auth/session`, server-only private-app auth env vars, and owner-scoped saved projects/parcels.
- Current development pass adds saved-project sidebar UI, MapLibre vector tiles, ranked/autocomplete search, and API hardening.
- Demo fallback remains available when `DATABASE_URL` is missing or still a placeholder.

## Current blockers

- [ ] Production Vercel still needs `APP_AUTH_PASSWORD` and `APP_AUTH_SESSION_SECRET` set before treating the live app as private.
- [ ] Saved-project sidebar can list saved parcels and notes, but full project management/edit/delete screens are not built yet.
- [ ] Vector tiles are live locally/API-smoked, but still need final production browser verification after deploy.
- [ ] Rate limiting is in-memory per serverless instance; use durable Redis/Edge Config later if this becomes multi-user/high-traffic.

## Next recommended tasks

- [ ] Set production auth env vars in Vercel and verify unauthenticated live access is blocked.
- [ ] Deploy this pass and verify live map tiles, search, sign-in, saved-project list, click lookup, and save flow.
- [ ] Add project/saved-parcel edit/delete actions with owner-scoped API routes.
- [ ] Add import-job logging before any automated data refresh work.
- [ ] Add a printable parcel brief/export view for selected and saved parcels.

## Later

- [ ] MLS/RESO integration after proper approval.
- [ ] Zoning layers.
- [ ] Wetland/flood/topography layers.
- [ ] Photo pins.
- [ ] Offline/mobile field mode.
- [ ] CMA map mode.

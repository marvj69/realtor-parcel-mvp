# Static parcel dataset and small Neon backend

Parcel map tiles, bounding boxes, click lookup, details and ranked search read an
immutable SQLite deployment asset. Neon retains accounts, projects, saved parcel
snapshots, notes, source metadata and a small dataset-key table. Saving a parcel
copies only that parcel into Neon, using its original UUID, in the same transaction
as saving the project/note. Existing saves and foreign keys remain intact.

This still uses Vercel functions for parcel API requests. It removes the bulk
PostGIS storage and query load; it does not make the app backend-free. Tiles are
generated from indexed local geometry as needed. There is no additional service.

## Data access and files

Some source notes restrict use to the private/internal app. Therefore, the public
Git repository contains only AES-256-GCM encrypted, compressed dataset chunks.
They are outside `public/`, included in the server bundle through Next file
tracing, and never exposed as bulk downloads. Existing API authentication remains
in effect. The encrypted `data/parcel-archive/` files preserve original source attributes for recovery and audits; they are not included in the deployed server bundle. No accounts, client names, notes, password hashes or user data are
exported. Dataset keys are stored only in `parcel_dataset_keys` in the existing
Neon backend. Do not publish that table or the ignored plaintext export directory.

On the first request per function instance, the server fetches one key, decrypts
and verifies the SHA-256 of the dataset, and opens a read-only temporary SQLite
file. Warm requests reuse the reader. A missing key or corrupt file fails closed;
there is no silent fallback to the pruned Neon table. Node 24 is required in
production. Cold starts have additional extraction time; monitor latency and
Vercel compute/bandwidth usage. This design does not promise unlimited free usage.

## Initial migration

1. Run `npm run parcels:export-static` with the existing production database.
   The export uses a repeatable-read snapshot, preserves exact parcel UUIDs,
   full geometry, source metadata, timestamps and original attributes, and checks
   total/source counts plus SQLite integrity. Original source attributes are retained in the recovery archive.
2. Run `npm run test:static`, `npm run typecheck`, `npm run lint`, `npm run build`.
   Compare all source counts and sample lookups/search results against PostGIS.
   Exercise account isolation, saving, notes, offline bbox downloads and tiles.
3. Commit `data/static-parcels/manifest.json` and every encrypted chunk referenced
   by it, plus the matching `data/parcel-archive/` files with the code, then deploy. Verify `/api/health` shows `parcel_storage:
   "static"`, the expected `parcel_count`, and the exact `dataset_version`.
4. Run `npm run parcels:prune -- --deployment=https://realtor-parcel-mvp.vercel.app`
   for a dry run. Add `--apply` only after live verification. The script checks the
   live deployment, decrypts/verifies the archive, locks parcel writes, and verifies
   every live parcel UUID/timestamp exists unchanged in the archive. It removes
   only unsaved parcel rows and then rewrites the now-small table to reclaim space.
   Keep source metadata and dataset keys. Never truncate with CASCADE.

Keep the ignored `work/parcel-export-*/` directory as a local recovery copy until
the release is established. New exporter versions also write `key.hex` there with
owner-only permissions. Keep a private backup of Neon, including its key table;
the encrypted Git files alone cannot recover data if the keys are lost.

## Refreshes

Recheck county-source terms and metadata before every refresh. Imports into the
small production backend are deliberately blocked. Import into a temporary/scratch
PostGIS database instead, using the existing fetch/import scripts. Preserve UUIDs
for unchanged `(source_key, source_feature_id)` pairs from the prior dataset before
exporting, so users' saved parcel references remain stable. Set
`PARCEL_KEY_DATABASE_URL` to the small production backend when exporting from
scratch; `DATABASE_DIRECT_URL`/`DATABASE_URL` select the source DB. Keep these
variables private. The exporter refuses a smaller dataset unless an intentional
reduction is reviewed and `--allow-smaller-dataset` is supplied.

Export, verify and deploy a complete new dataset atomically with its manifest.
Remove obsolete encrypted chunks from the current tree only after a new manifest
is verified; Git history retains earlier releases. Keep earlier version keys to
support rolling back to an earlier static-data release. Existing saved snapshots
remain available even if a source is later removed.

## Rollback

Rolling back to an earlier **static-data** release uses its matching encrypted
files and retained key. Do not roll back to a PostGIS-only release after pruning:
it would show only saved parcels. Restore the archived full dataset into PostGIS
first with `npm run parcels:restore -- --apply`, check counts and headroom, then
deploy the older code. This returns the original storage footprint and may again
approach the Neon allowance. The restore keeps existing saved rows unchanged.

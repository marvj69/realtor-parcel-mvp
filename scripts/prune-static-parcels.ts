import { Client } from "pg";
import { loadEnv,getDatabaseConnectionString } from "./load-env";
import { getStaticParcels } from "../src/lib/static-parcels";
import { getPool } from "../src/lib/db";
import {openParcelArchive} from "./open-parcel-archive";
loadEnv();

async function main() {
  const store=await getStaticParcels(); // Authenticates, decrypts and checks the complete artifact hash.
  const archive=await openParcelArchive(store.manifest!.version);
  const url=process.argv.find(a=>a.startsWith("--deployment="))?.slice(13);
  if (!url) throw new Error("Supply --deployment=https://verified-production-host before pruning");
  const response=await fetch(new URL("/api/health",url));
  const health=await response.json();
  if (!response.ok || health.data?.parcel_storage!=="static" || health.data?.dataset_version!==store.manifest!.version
    || health.data?.parcel_count!==store.count) throw new Error("Deployment does not serve this complete dataset");
  const client=new Client({connectionString:getDatabaseConnectionString() ?? undefined});
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='15s'");
    await client.query("LOCK TABLE parcels IN SHARE ROW EXCLUSIVE MODE");
    const before=await client.query(`SELECT (SELECT count(*) FROM parcels)::int parcels,
      (SELECT count(*) FROM saved_parcels)::int saves,(SELECT count(*) FROM parcel_notes)::int notes,
      (SELECT count(*) FROM projects)::int projects,(SELECT count(*) FROM app_users)::int users`);
    await client.query("DECLARE verify_rows NO SCROLL CURSOR FOR SELECT id::text,updated_at::text FROM parcels");
    let verified=0;
    while (true) {
      const batch=await client.query("FETCH 1000 FROM verify_rows");
      if (!batch.rows.length) break;
      for (const row of batch.rows) {
        const archived=store.get(row.id);
        if (!archived || archived.updated_at!==row.updated_at || !archive.prepare("SELECT id FROM attributes WHERE id=?").get(row.id)) throw new Error("Live parcel changed after export; rebuild before pruning");
        verified++;
      }
    }
    if (verified!==before.rows[0].parcels) throw new Error("Verification count mismatch");
    if (!process.argv.includes("--apply")) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({dryRun:true,verified,...before.rows[0]}));
      return;
    }
    const result=await client.query("DELETE FROM parcels p WHERE NOT EXISTS(SELECT 1 FROM saved_parcels sp WHERE sp.parcel_id=p.id)");
    const missing=await client.query("SELECT count(*)::int n FROM saved_parcels sp LEFT JOIN parcels p ON p.id=sp.parcel_id WHERE p.id IS NULL");
    if (missing.rows[0].n!==0) throw new Error("Saved parcel preservation failed");
    await client.query("COMMIT");
    // Rewrite only the now-tiny saved snapshot table to return disk space to Neon.
    await client.query("VACUUM (FULL, ANALYZE) parcels");
    const size=await client.query("SELECT pg_database_size(current_database())::text bytes,pg_size_pretty(pg_database_size(current_database())) size,(SELECT count(*) FROM parcels)::int retained");
    console.log(JSON.stringify({deleted:result.rowCount,before:before.rows[0],after:size.rows[0]}));
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally {await client.end();archive.close();store.close();await getPool().end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

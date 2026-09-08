import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { decodeParcel, type DatasetAsset, type DatasetManifest } from "../src/lib/static-parcel-format";
import { SEARCH_FIELDS, SEARCH_PROPERTY_FIELDS } from "../src/lib/parcel-search";
import { parcelPropertiesFromRow, parsePoint } from "../src/lib/parcels";
import { loadEnv } from "./load-env";

export async function buildParcelSearchIndex(sourcePath: string, destination: string) {
  await rm(destination, { force: true });
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const db = new DatabaseSync(destination);
  try {
    db.exec(`PRAGMA journal_mode=OFF;
      CREATE TABLE parcels(n INTEGER PRIMARY KEY, id TEXT NOT NULL, payload TEXT NOT NULL,
        ${SEARCH_FIELDS.map(field => `${field} TEXT`).join(",")}, apn_norm TEXT, parcel_norm TEXT);
      CREATE VIRTUAL TABLE parcel_search USING fts5(terms, content='', tokenize='trigram', detail=none, columnsize=0);`);
    const insert = db.prepare("INSERT INTO parcels VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    db.exec("BEGIN");
    for (const row of source.prepare("SELECT n,payload,apn_norm,parcel_norm FROM parcels ORDER BY n").iterate()) {
      const parcel = decodeParcel(row.payload as Uint8Array);
      const result = { ...parcelPropertiesFromRow(parcel), center: parsePoint(parcel.center) };
      insert.run(row.n, parcel.id, JSON.stringify(SEARCH_PROPERTY_FIELDS.map(field => result[field] ?? null)),
        ...SEARCH_FIELDS.map(field => parcel[field] ?? null), row.apn_norm, row.parcel_norm);
    }
    db.exec(`INSERT INTO parcel_search(rowid,terms) SELECT n,
      ${[...SEARCH_FIELDS, "apn_norm", "parcel_norm"].map(field => `lower(coalesce(${field},''))`).join(" || char(10) || ")}
      FROM parcels;
      INSERT INTO parcel_search(parcel_search) VALUES('optimize');
      COMMIT; VACUUM;`);
    if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Search index integrity check failed");
    db.exec("INSERT INTO parcel_search(parcel_search) VALUES('integrity-check')");
    return Number(db.prepare("SELECT count(*) n FROM parcels").get()!.n);
  } finally {
    db.close();
    source.close();
  }
}

export async function packageParcelSearch(sourcePath: string, work: string, manifest: DatasetManifest, key: Buffer): Promise<DatasetAsset> {
  const path = `${work}/search.sqlite`;
  const count = await buildParcelSearchIndex(sourcePath, path);
  if (count !== manifest.count) throw new Error("Search index parcel count mismatch");
  const sha = createHash("sha256");
  for await (const chunk of createReadStream(path)) sha.update(chunk);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  await pipeline(createReadStream(path), createGzip({ level: 9 }), cipher, createWriteStream(`${work}/search.enc`, { mode: 0o600 }));
  const encrypted = await readFile(`${work}/search.enc`);
  const sqliteBytes = (await stat(path)).size;
  if (sqliteBytes + manifest.sqliteBytes > 450 * 1024 ** 2) throw new Error("Parcel search exceeds temporary storage budget");
  if (encrypted.length > 200 * 1024 ** 2) throw new Error("Parcel search exceeds function bundle budget");
  const parts: string[] = [];
  for (let offset = 0; offset < encrypted.length; offset += 32 * 1024 ** 2) {
    const part = `${manifest.version}.search.${parts.length}.enc`;
    await writeFile(`data/static-parcels/${part}`, encrypted.subarray(offset, offset + 32 * 1024 ** 2));
    parts.push(part);
  }
  console.log(JSON.stringify({ searchCount: count, sqliteBytes, encryptedBytes: encrypted.length }));
  return { parts, sqliteBytes, sha256: sha.digest("hex"), iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

async function main() {
  loadEnv();
  const { getStaticParcels } = await import("../src/lib/static-parcels");
  const { getPool, query } = await import("../src/lib/db");
  const store = await getStaticParcels();
  try {
    const manifest = store.manifest!;
    const [row] = await query<{ key_hex: string }>("SELECT key_hex FROM parcel_dataset_keys WHERE version=$1", [manifest.version]);
    const work = `work/parcel-search-${manifest.version}`;
    await mkdir(work, { recursive: true, mode: 0o700 });
    const sourcePath = store.db.prepare("PRAGMA database_list").get()!.file as string;
    manifest.search = await packageParcelSearch(sourcePath, work, manifest, Buffer.from(row.key_hex, "hex"));
    await writeFile("data/static-parcels/manifest.json.tmp", JSON.stringify(manifest, null, 2) + "\n");
    await rename("data/static-parcels/manifest.json.tmp", "data/static-parcels/manifest.json");
  } finally {
    store.close();
    await getPool().end();
  }
}

if (process.argv[1]?.endsWith("/build-parcel-search.ts")) void main().catch(error => { console.error(error); process.exitCode = 1; });

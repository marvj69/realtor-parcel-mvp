import { DatabaseSync } from "node:sqlite";
import { Client } from "pg";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile, rename, copyFile, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip, gunzipSync } from "node:zlib";
import { decodeParcel, encodeRuntimeParcel, type DatasetManifest } from "../src/lib/static-parcel-format";

export async function packageStaticDataset(work:string,sourceCounts:Record<string,number>,client:Client,version:string) {
  await copyFile(`${work}/parcels.sqlite`,`${work}/runtime.sqlite`);
  const runtime=new DatabaseSync(`${work}/runtime.sqlite`);
  await rm(`${work}/attributes.sqlite`,{force:true});
  const archive=new DatabaseSync(`${work}/attributes.sqlite`);
  archive.exec("PRAGMA journal_mode=OFF; CREATE TABLE attributes(id TEXT PRIMARY KEY, raw TEXT)");
  const putRaw=archive.prepare("INSERT INTO attributes VALUES(?,?)");
  const putRuntime=runtime.prepare("UPDATE parcels SET payload=? WHERE n=?");
  const count=Number(runtime.prepare("SELECT count(*) n FROM parcels").get()!.n);
  for(let start=0;start<count;start+=1000) {
    const rows=runtime.prepare("SELECT n,payload FROM parcels WHERE n>? AND n<=?").all(start,start+1000);
    runtime.exec("BEGIN");archive.exec("BEGIN");
    for(const r of rows) {
      const {raw_attributes_gzip,...parcel}=decodeParcel(r.payload as Uint8Array);
      putRaw.run(parcel.id,raw_attributes_gzip ? gunzipSync(Buffer.from(raw_attributes_gzip,"hex")).toString("utf8") : null);
      putRuntime.run(encodeRuntimeParcel(parcel),r.n);
    }
    runtime.exec("COMMIT");archive.exec("COMMIT");
  }
  runtime.exec("VACUUM");archive.exec("VACUUM");
  for(const db of [runtime,archive]) {
    if(db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok") throw new Error("Archive integrity check failed");
    db.close();
  }
  let key=randomBytes(32);
  const keyClient=process.env.PARCEL_KEY_DATABASE_URL ? new Client({connectionString:process.env.PARCEL_KEY_DATABASE_URL}) : client;
  if(keyClient!==client) await keyClient.connect();
  try {
    await keyClient.query(`CREATE TABLE IF NOT EXISTS parcel_dataset_keys
      (version text PRIMARY KEY,key_hex text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
    const existing=await keyClient.query("SELECT key_hex FROM parcel_dataset_keys WHERE version=$1",[version]);
    if(existing.rows[0]) key=Buffer.from(existing.rows[0].key_hex,"hex");
    else await keyClient.query("INSERT INTO parcel_dataset_keys(version,key_hex) VALUES($1,$2)",[version,key.toString("hex")]);
    await writeFile(`${work}/key.hex`,key.toString("hex"),{mode:0o600});
  } finally {if(keyClient!==client) await keyClient.end();}
  async function encrypt(name:string,directory:string) {
    const input=`${work}/${name}.sqlite`;
    const sqliteBytes=(await stat(input)).size;
    if(name==="runtime" && sqliteBytes>450*1024**2) throw new Error("Runtime dataset exceeds temporary storage budget");
    const hash=createHash("sha256");
    for await(const chunk of createReadStream(input)) hash.update(chunk);
    const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
    await pipeline(createReadStream(input),createGzip({level:9}),cipher,createWriteStream(`${work}/${name}.enc`));
    const encrypted=await readFile(`${work}/${name}.enc`);
    if(name==="runtime" && encrypted.length>200*1024**2) throw new Error("Runtime dataset exceeds function bundle budget");
    await mkdir(directory,{recursive:true});
    const parts:string[]=[];
    for(let i=0;i<encrypted.length;i+=32*1024**2) {
      const file=`${version}.${parts.length}.enc`;
      await writeFile(`${directory}/${file}`,encrypted.subarray(i,i+32*1024**2));parts.push(file);
    }
    const manifest:DatasetManifest={format:1,version,createdAt:new Date().toISOString(),count,sourceCounts,sqliteBytes,
      sha256:hash.digest("hex"),parts,iv:iv.toString("hex"),tag:cipher.getAuthTag().toString("hex")};
    await writeFile(`${directory}/manifest.json.tmp`,JSON.stringify(manifest,null,2)+"\n");
    console.log(JSON.stringify({name,count,sqliteBytes,encryptedBytes:encrypted.length,version}));
  }
  await encrypt("attributes","data/parcel-archive");
  await encrypt("runtime","data/static-parcels");
  await rename("data/parcel-archive/manifest.json.tmp","data/parcel-archive/manifest.json");
  await rename("data/static-parcels/manifest.json.tmp","data/static-parcels/manifest.json");
}

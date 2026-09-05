import { DatabaseSync } from "node:sqlite";
import { createDecipheriv,createHash } from "node:crypto";
import { createReadStream,createWriteStream } from "node:fs";
import { mkdir,readFile,rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { query } from "../src/lib/db";
import type { DatasetManifest } from "../src/lib/static-parcel-format";

// Recovery-only original source attributes. Never traced into deployed API functions.
export async function openParcelArchive(version:string) {
  const manifest:DatasetManifest=JSON.parse(await readFile("data/parcel-archive/manifest.json","utf8"));
  if(manifest.version!==version) throw new Error("Recovery archive version mismatch");
  const [key]=await query<{key_hex:string}>("SELECT key_hex FROM parcel_dataset_keys WHERE version=$1",[version]);
  if(!key) throw new Error("Recovery key missing");
  await mkdir("work",{recursive:true});
  const path=`work/recovery-${version}.sqlite`;
  const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key.key_hex,"hex"),Buffer.from(manifest.iv,"hex"));
  decipher.setAuthTag(Buffer.from(manifest.tag,"hex"));
  async function* chunks() {
    for(const part of manifest.parts) {
      if(!/^[0-9]+\.[0-9]+\.enc$/.test(part)) throw new Error("Invalid archive part");
      for await(const chunk of createReadStream(`data/parcel-archive/${part}`)) yield chunk;
    }
  }
  try {
    await pipeline(Readable.from(chunks()),decipher,createGunzip(),createWriteStream(path,{mode:0o600}));
    const hash=createHash("sha256");
    for await(const chunk of createReadStream(path)) hash.update(chunk);
    if(hash.digest("hex")!==manifest.sha256) throw new Error("Recovery checksum mismatch");
    const db=new DatabaseSync(path,{readOnly:true});
    if(Number(db.prepare("SELECT count(*) n FROM attributes").get()!.n)!==manifest.count) {
      db.close();throw new Error("Recovery attribute count mismatch");
    }
    return db;
  } catch(error){await rm(path,{force:true});throw error;}
}

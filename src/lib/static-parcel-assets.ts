import { createRequire } from "node:module";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { query } from "./db";
import type { DatasetAsset, DatasetManifest } from "./static-parcel-format";

// Keep a real Node require: Turbopack's SQLite external wrapper is not portable.
export const { DatabaseSync } = createRequire(join(process.cwd(), "package.json"))("node:sqlite") as typeof import("node:sqlite");
export const dataPath = () => join(process.cwd(), "data/static-parcels");
let manifestPending: Promise<DatasetManifest> | undefined;
const keys = new Map<string, Promise<Buffer>>();

export function getParcelManifest(): Promise<DatasetManifest> {
  manifestPending ??= readFile(join(dataPath(), "manifest.json"), "utf8").then(text => {
    const manifest: DatasetManifest = JSON.parse(text);
    if (manifest.format !== 1 || !/^[0-9]+$/.test(manifest.version)) throw new Error("Unsupported parcel dataset");
    return manifest;
  }).catch(error => { manifestPending = undefined; throw error; });
  return manifestPending;
}

function getKey(version: string): Promise<Buffer> {
  let pending = keys.get(version);
  if (!pending) {
    pending = query<{ key_hex: string }>("SELECT key_hex FROM parcel_dataset_keys WHERE version=$1", [version])
      .then(([row]) => {
        if (!row || !/^[a-f0-9]{64}$/i.test(row.key_hex)) throw new Error("Parcel dataset key unavailable");
        return Buffer.from(row.key_hex, "hex");
      }).catch(error => { keys.delete(version); throw error; });
    keys.set(version, pending);
  }
  return pending;
}

export async function openParcelAsset(manifest: DatasetManifest, asset: DatasetAsset, kind: "runtime" | "search") {
  const key = await getKey(manifest.version);
  const destination = join(tmpdir(), `parcel-${manifest.version}-${kind}-${asset.sha256.slice(0, 16)}.sqlite`);
  if (existsSync(destination)) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    if (hash.digest("hex") === asset.sha256) return destination;
    await rm(destination, { force: true });
  }
  const partial = `${destination}.${randomUUID()}.partial`;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(asset.iv, "hex"));
  decipher.setAuthTag(Buffer.from(asset.tag, "hex"));
  const hash = createHash("sha256");
  let bytes = 0;
  const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    hash.update(chunk);
    callback(bytes > asset.sqliteBytes ? new Error("Parcel dataset size mismatch") : null, chunk);
  } });
  async function* chunks() {
    for (const part of asset.parts) {
      if (!/^[0-9]+\.(?:search\.)?[0-9]+\.enc$/.test(part)) throw new Error("Invalid dataset part");
      for await (const chunk of createReadStream(join(dataPath(), part))) yield chunk;
    }
  }
  try {
    // Verify during extraction instead of reading the entire SQLite file twice.
    await pipeline(Readable.from(chunks()), decipher, createGunzip(), verify, createWriteStream(partial, { mode: 0o600 }));
    if (bytes !== asset.sqliteBytes || hash.digest("hex") !== asset.sha256) throw new Error("Parcel dataset checksum mismatch");
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

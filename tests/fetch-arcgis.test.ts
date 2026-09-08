import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("ArcGIS offsets include source records skipped for missing geometry", async () => {
  const offsets: number[] = [];
  const polygon = (id: number) => ({ attributes: { OBJECTID: id }, geometry: {
    rings: [[[-88, 46], [-88, 47], [-87, 47], [-87, 46], [-88, 46]]]
  } });
  const rows = [{ attributes: { OBJECTID: 1 }, geometry: null }, polygon(2), polygon(3), polygon(4)];
  const server = createServer((req, res) => {
    const offset = Number(new URL(req.url!, "http://localhost").searchParams.get("resultOffset"));
    offsets.push(offset);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ features: rows.slice(offset, offset + 2), exceededTransferLimit: offset + 2 < rows.length }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const directory = await mkdtemp(join(tmpdir(), "parcel-fetch-test-"));
  try {
    const config = join(directory, "sources.json"), output = join(directory, "parcels.geojson");
    await writeFile(config, JSON.stringify([{ sourceKey: "fixture", sourceUrl: `http://127.0.0.1:${address.port}/layer`,
      inputFile: output, sourceFormat: "arcgis_json", sourceProjection: "EPSG:4326", pageSize: 2 }]));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/fetch-arcgis-layer.ts", `--config=${config}`]);
      let log = "";
      child.stdout.on("data", data => { log += data; });
      child.stderr.on("data", data => { log += data; });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(log)));
    });
    assert.deepEqual(offsets, [0, 2, 4]);
    const result = JSON.parse(await readFile(output, "utf8"));
    assert.deepEqual(result.features.map((f: { properties: { OBJECTID: number } }) => f.properties.OBJECTID), [2, 3, 4]);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

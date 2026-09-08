import { loadEnv } from "./load-env";
import { getStaticParcels } from "../src/lib/static-parcels";
import { getStaticParcelSearch } from "../src/lib/static-parcel-search";
import { getPool } from "../src/lib/db";

async function main() {
loadEnv();
const started = performance.now();
const store = await getStaticParcels();
const openMs = performance.now() - started;
const searchStarted=performance.now();
const searcher=await getStaticParcelSearch();
const searchOpenMs=performance.now()-searchStarted;
const results: Record<string, unknown> = {};
function measure(name: string, operation: () => unknown) {
  const times: number[] = [];
  let value: unknown;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    value = operation();
    times.push(performance.now() - start);
  }
  results[name] = { firstMs: times[0], medianMs: [...times].sort((a,b)=>a-b)[2],
    resultCount: Array.isArray(value) ? value.length : value instanceof Uint8Array ? value.byteLength : Number(Boolean(value)) };
}
for (const q of ["Houghton", "Lake Linden", "Heinonen", "RESIDENTIAL", "044127", "AB", "%' OR 1=1 --"])
  measure(`search:${q}`, () => searcher.search(q, 50));
for (const [name,lng,lat] of [["Houghton",-88.569,47.1211],["Marquette",-87.3954,46.5436]] as const) {
  measure(`lookup:${name}`, () => store.lookup(lng,lat));
  for (const z of [13,15,17]) {
    const x=Math.floor((lng+180)/360*2**z);
    const y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
    measure(`tile:${name}:${z}`,()=>store.tile(z,x,y));
  }
}
const report={dataset:store.manifest?.version,count:store.count,openMs,searchOpenMs,results,memory:process.memoryUsage()};
console.log(JSON.stringify(report,null,2));
store.close();
await getPool().end();
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

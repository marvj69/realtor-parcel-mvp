import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { StaticParcelStore } from "../src/lib/static-parcels";
import type { ParcelRow } from "../src/types/parcel";

const directory=mkdtempSync(join(tmpdir(),"parcel-test-"));
const filename=join(directory,"fixture.sqlite");
const db=new DatabaseSync(filename);
db.exec(`CREATE TABLE parcels(n INTEGER PRIMARY KEY,id TEXT UNIQUE,source_key TEXT,source_feature_id TEXT,
 payload BLOB,parcel_id TEXT,apn TEXT,owner_name TEXT,site_address TEXT,mailing_address TEXT,land_use TEXT,
 parcel_norm TEXT,apn_norm TEXT,area REAL,west REAL,south REAL,east REAL,north REAL);
 CREATE VIRTUAL TABLE bounds USING rtree(n,west,east,south,north);`);
const outer=[[-89,46],[-88,46],[-88,47],[-89,47],[-89,46]];
const hole=[[-88.8,46.2],[-88.8,46.8],[-88.2,46.8],[-88.2,46.2],[-88.8,46.2]];
function add(n:number,apn:string,owner:string,geometry:ParcelRow["geometry"],area:number) {
 const row:ParcelRow={id:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,source_key:"test",source_feature_id:String(n),
 provider:"fixture",source_county:"Test",state:"MI",parcel_id:apn,apn,owner_name:owner,site_address:"100 Test Road",
 mailing_address:"PO Box 2",acreage:10,assessed_value:1000,land_use:"RESIDENTIAL",geometry,center:{type:"Point",coordinates:[-88.9,46.1]}};
 db.prepare("INSERT INTO parcels VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(n,row.id,"test",String(n),gzipSync(JSON.stringify(row)),
 apn,apn,owner,row.site_address!,row.mailing_address!,row.land_use!,apn.toLowerCase().replace(/[^a-z0-9]/g,""),
 apn.toLowerCase().replace(/[^a-z0-9]/g,""),area,-89,46,-88,47);
 db.prepare("INSERT INTO bounds VALUES(?,?,?,?,?)").run(n,-89,-88,46,47);
 return row;
}
const first=add(1,"AB-12-34","Example Owner",{type:"Polygon",coordinates:[outer,hole]},100);
add(2,"AB-12-345","Second Owner",{type:"MultiPolygon",coordinates:[[outer,hole]]},200);
db.close();
const store=new StaticParcelStore(filename);
after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});

test("point lookup excludes polygon holes and empty space, includes boundaries",()=>{
 assert.equal(store.lookup(-88.5,46.5),null);
 assert.equal(store.lookup(-90,46.5),null);
 assert.equal(store.lookup(-89,46.1)?.properties.id,first.id);
});
test("overlapping sources select the smaller equally complete parcel",()=>{
 assert.equal(store.lookup(-88.9,46.1)?.properties.id,first.id);
});
test("bbox counts, record limits, provenance and full detail are preserved",()=>{
 assert.equal(store.countBbox([-89,46,-88,47]),2);
 assert.equal(store.countBbox([-91,46,-90,47]),0);
 const result=store.bbox([-89,46,-88,47],1);
 assert.equal(result.features.length,1);
 assert.equal(result.features[0].properties.provider,"fixture");
 assert.deepEqual(store.get(first.id)?.geometry,first.geometry);
 assert.equal(store.get("missing"),null);
});
test("search keeps normalized APN exact matches above prefixes, supports owner/address and literal wildcards",()=>{
 assert.equal(store.search("AB1234",10)[0].id,first.id);
 assert.equal(store.search("example",10)[0].matchKind,"owner_name");
 assert.equal(store.search("Test Road",1).length,1);
 assert.equal(store.search("PO Box",10).length,2);
 assert.equal(store.search("%' OR 1=1 --",10).length,0);
});
test("vector tiles contain a parcels layer and empty tiles return null",()=>{
 const z=13,lng=-88.9,lat=46.1;
 const x=Math.floor((lng+180)/360*2**z);
 const y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
 const tile=store.tile(z,x,y);
 assert.ok(tile && tile.length>0);
 assert.ok(Buffer.from(tile).includes(Buffer.from("parcels")));
 assert.equal(store.tile(z,0,0),null);
});
test("dataset cannot be mutated by runtime reader",()=>{
 assert.throws(()=>store.db.exec("DELETE FROM parcels"),/readonly|read-only/i);
});

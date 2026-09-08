import assert from 'node:assert/strict';
import {readFileSync,statSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
const required=JSON.parse(readFileSync('config/next-runtime-files.json'));
const routes=['auth/register','auth/session','health','parcels/bbox','parcels/lookup','parcels/search','parcels/tiles/[z]/[x]/[y]','projects','saved-parcels'];
const manifest=JSON.parse(readFileSync('data/static-parcels/manifest.json'));
for(const route of routes){
 const path=resolve('.next/server/app/api',route,'route.js.nft.json');
 const files=new Set(JSON.parse(readFileSync(path)).files.map(file=>resolve(dirname(path),file)));
 for(const file of required)assert.ok(files.has(resolve(file)),`${route} omits runtime dependency: ${file}`);
 // Hosted CI checkouts themselves live under /home/runner/work. Inspect paths
 // relative to the checkout so only private project files are rejected.
 assert.ok([...files].every(f=>relative(process.cwd(),f).split(/[\\/]/).every(part=>part!=='work'&&part!=='parcel-archive'&&!part.startsWith('.env'))),`${route} includes private files`);
 const bytes=[...files].reduce((sum,f)=>sum+statSync(f).size,0);assert.ok(bytes<250*1024**2,`${route} exceeds bundle limit`);
 if(route.startsWith('parcels/') || route==='health' || route==='saved-parcels') {
   const isSearch=route==='parcels/search' && manifest.search;
   const expected=isSearch ? manifest.search.parts : manifest.parts;
   for(const part of expected)assert.ok(files.has(resolve('data/static-parcels',part)),`${route} omits dataset part ${part}`);
   const unneeded=isSearch ? manifest.parts : (manifest.search?.parts || []);
   for(const part of unneeded)assert.ok(!files.has(resolve('data/static-parcels',part)),`${route} bundles unnecessary dataset part ${part}`);
 }
}
const root=mkdtempSync(join(tmpdir(),'parcel-launcher-test-'));
try{
 for(const file of required){const destination=join(root,file);mkdirSync(dirname(destination),{recursive:true});copyFileSync(file,destination);}
 execFileSync(process.execPath,['-e',`require(${JSON.stringify(join(root,'node_modules/next/dist/server/node-environment.js'))})`],{cwd:root,env:{...process.env,NODE_ENV:'production',NODE_PATH:''},stdio:'pipe'});
}finally{rmSync(root,{recursive:true,force:true});}
console.log('Deployment bundle verified: all runtime dependencies present, isolated launcher loads, no private files, all functions under 250 MiB.');

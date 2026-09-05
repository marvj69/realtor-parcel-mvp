import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {nodeFileTrace}=require('next/dist/compiled/@vercel/nft');
// Vercel's launcher loads this entry before API handlers. Turbopack's route-only
// trace can omit its dependencies even though next build succeeds.
const trace=await nodeFileTrace(['node_modules/next/dist/server/node-environment.js'],{base:process.cwd()});
const files=[...trace.fileList].filter(file=>!file.endsWith('.map')).sort();
await writeFile('config/next-runtime-files.json',JSON.stringify(files,null,2)+'\n');

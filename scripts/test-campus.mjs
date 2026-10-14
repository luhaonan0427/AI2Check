import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dir=path.resolve('.sites-runtime/checks');await mkdir(dir,{recursive:true});
const outfile=path.join(dir,'campus-tests.mjs');
await build({entryPoints:['tests/campus.test.ts'],outfile,bundle:true,platform:'node',format:'esm'});
await import(pathToFileURL(outfile));

// Explicit local-only import. Source databases are opened read-only; no sessions or rate limits are imported.
import {DatabaseSync,backup} from 'node:sqlite';
import {readdirSync,mkdirSync,existsSync,copyFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const source=path.resolve(process.argv[2]||'');
if(!process.argv[2]||source===process.cwd())throw Error('Pass the old project folder as the source.');
const root=process.cwd(), state=path.join(root,'.wrangler/state/v3');
const folder='miniflare-D1DatabaseObject';
const find=(dir)=>{const files=readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&!f.startsWith('metadata'));if(files.length!==1)throw Error('Expected one application database in '+dir);return path.join(dir,files[0]);};
const inside=(file)=>{const relative=path.relative(root,path.resolve(file));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Destination outside project');return file;};
const oldDb=new DatabaseSync(find(path.join(source,'.wrangler/state/v3/d1',folder)),{readOnly:true});
const targetDb=new DatabaseSync(inside(find(path.join(state,'d1',folder))));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');const backups=inside(path.join(root,'.sites-runtime/backups',stamp));mkdirSync(backups,{recursive:true});
await backup(targetDb,path.join(backups,'before-import.sqlite'));
const tables=['accounts','courses','classes','enrollments','assignments','submissions','submission_history','uploads'];
const inserts=[];const counts={};
oldDb.exec('BEGIN');
for(const table of tables){
 const columns=oldDb.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
 if(!columns.length)throw Error('Source missing '+table);
 const rows=oldDb.prepare(`SELECT * FROM ${table}`).all();counts[table]=0;
 const statement=targetDb.prepare(`INSERT INTO campus_${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
 for(const row of rows){const existing=targetDb.prepare(`SELECT * FROM campus_${table} WHERE id=?`).get(row.id);if(existing){if(columns.some(c=>existing[c]!==row[c]))throw Error('Conflicting record in '+table+'; import cancelled without overwriting.');continue;}inserts.push({statement,values:columns.map(c=>row[c]),table});}
}
const r2Folder='miniflare-R2BucketObject';const sourceR2=new DatabaseSync(find(path.join(source,'.wrangler/state/v3/r2',r2Folder)),{readOnly:true});
const targetR2=new DatabaseSync(inside(find(path.join(state,'r2',r2Folder))));
await backup(targetR2,path.join(backups,'before-import-r2.sqlite'));
const blobDir=inside(path.join(state,'r2/site-creator-r2/blobs'));mkdirSync(blobDir,{recursive:true});
const uploads=oldDb.prepare('SELECT id FROM uploads').all();const objects=[];
const r2Columns=sourceR2.prepare('PRAGMA table_info(_mf_objects)').all().map(c=>c.name);
for(const {id} of uploads){
 const key='campus/'+id;const object=sourceR2.prepare('SELECT * FROM _mf_objects WHERE key=?').get(key);if(!object)throw Error('Source image missing; import cancelled.');
 if(!/^[a-f0-9]{64,100}$/.test(object.blob_id))throw Error('Unexpected blob identifier');
 const from=path.join(source,'.wrangler/state/v3/r2/site-creator-r2/blobs',object.blob_id),to=inside(path.join(blobDir,object.blob_id));
 const digest=(file)=>createHash('sha256').update(readFileSync(file)).digest('hex');
 if(!existsSync(from))throw Error('Source blob missing');
 const existing=targetR2.prepare('SELECT * FROM _mf_objects WHERE key=?').get(key);
 if(existing){if(!/^[a-f0-9]{64,100}$/.test(existing.blob_id)||digest(from)!==digest(path.join(blobDir,existing.blob_id)))throw Error('Image conflict; no overwrite');continue;}
 if(existsSync(to)&&digest(from)!==digest(to))throw Error('Blob conflict; no overwrite');
 objects.push({object,from,to});
}
try{
 targetDb.exec('BEGIN');targetR2.exec('BEGIN');
 for(const entry of objects){copyFileSync(entry.from,entry.to);targetR2.prepare(`INSERT INTO _mf_objects(${r2Columns.map(c=>'"'+c+'"').join(',')}) VALUES(${r2Columns.map(()=>'?').join(',')})`).run(...r2Columns.map(c=>entry.object[c]));}
 for(const entry of inserts){entry.statement.run(...entry.values);counts[entry.table]++;}
 targetR2.exec('COMMIT');targetDb.exec('COMMIT');
 console.log('Imported local teaching records:',counts,'photos:',objects.length);
 console.log('Ignored local backup:',path.relative(root,backups));
}catch(e){try{targetDb.exec('ROLLBACK')}catch{}try{targetR2.exec('ROLLBACK')}catch{}throw e}
finally{oldDb.exec('ROLLBACK');oldDb.close();sourceR2.close();targetDb.close();targetR2.close();}

// Explicit local reset: back up before clearing teaching records; retain accounts and credentials.
import {DatabaseSync,backup} from 'node:sqlite';
import {readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),dir=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files=readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&!f.startsWith('metadata'));
if(files.length!==1)throw Error('Expected exactly one local application database.');
const db=new DatabaseSync(path.join(dir,files[0]));
const destination=path.join(root,'.sites-runtime/backups',new Date().toISOString().replace(/[:.]/g,'-')+'-clear-teaching');
mkdirSync(destination,{recursive:true});await backup(db,path.join(destination,'before-clear.sqlite'));
const tables=['campus_tutor_messages','campus_submission_history','campus_submissions','campus_uploads','campus_roster','campus_enrollments','campus_assignments','campus_classes','campus_courses','tutor_messages','submissions','assignments','enrollments','courses','workspaces'];
const existing=tables.filter(t=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t));
const counts=Object.fromEntries(existing.map(t=>[t,db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
db.exec('BEGIN IMMEDIATE');try{for(const table of existing)db.exec(`DELETE FROM ${table}`);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}finally{db.close()}
writeFileSync(path.join(destination,'cleared-counts.json'),JSON.stringify(counts,null,2));
console.log(JSON.stringify({backup:path.relative(root,destination),cleared:counts,accounts:'retained',uploads:'metadata cleared; original objects retained for recovery'},null,2));

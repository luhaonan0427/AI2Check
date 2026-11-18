// Fallback for this checkout when the installed Sites workflow helper is unavailable.
// Accept credentials only from hidden stdin. Never write credentials to disk or Git config.
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for Site workflow JSON on stdin (input is hidden).');
let buffer='';const credential=await new Promise((resolve,reject)=>{process.stdin.setEncoding('utf8');process.stdin.on('data',function receive(chunk){if(chunk.includes('\u0003'))process.exit(130);buffer+=chunk;if(buffer.includes('\n')||buffer.includes('\r')){process.stdin.off('data',receive);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try{resolve(JSON.parse(buffer.trim()).credential)}catch(e){reject(e)}}});});
if(!credential.token||credential.auth_mode!=='http_extra_header'||!credential.remote_url.startsWith('https://git.chatgpt-team.site/')||!credential.remote_url.includes(manifest.project_id)||credential.branch!=='main')throw new Error('Unexpected source credential shape');
function run(command,args,env=process.env){if(command==='git')args=['-c','safe.directory='+root.replaceAll('\\','/'),...args];const r=spawnSync(command,args,{cwd:root,encoding:'utf8',env,windowsHide:true,maxBuffer:8*1024*1024});if(r.error||r.status!==0){const msg=String(r.stderr||r.error||r.stdout).split(credential.token).join('[REDACTED]');throw new Error(`${command} failed: ${msg}`)}return r.stdout.trim();}
run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
run(process.execPath,['scripts/run-framework.mjs','build']);
if(!existsSync('dist/server/index.js'))throw new Error('Missing Worker build');
// 必须校验「全部」迁移都在产物里：只查某一个文件名的话，新增的表结构
// （例如 0001_teaching_platform.sql）漏掉也能通过，线上就会缺表。
const migrationDir='dist/.openai/drizzle';
const sourceMigrations=readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort();
if(!sourceMigrations.length)throw new Error('No database migrations found in drizzle/');
for(const name of sourceMigrations){if(!existsSync(path.join(migrationDir,name)))throw new Error(`Missing database migration in build: ${name}`);}
if(!existsSync('.git'))run('git',['init','-b','main']);
run('git',['config','user.name','MathFlow Builder']);run('git',['config','user.email','mathflow-builder@users.noreply.local']);
const remotes=run('git',['remote']);if(!remotes.split('\n').includes('origin'))run('git',['remote','add','origin',credential.remote_url]);
if(run('git',['remote','get-url','origin'])!==credential.remote_url)throw new Error('Remote mismatch');
run('git',['add','.']);
const changes=run('git',['diff','--cached','--name-only']);if(changes)run('git',['commit','-m','Build MathFlow teaching workspace with durable submissions and grading review']);
const sha=run('git',['rev-parse','HEAD']);
const gitEnv={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:`http.${credential.remote_url}.extraHeader`,GIT_CONFIG_VALUE_0:`Authorization: Bearer ${credential.token}`,GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:''};
run('git',['push','origin','HEAD:main'],gitEnv);
const remoteSha=run('git',['ls-remote','origin','refs/heads/main'],gitEnv).split(/\s/)[0];if(remoteSha!==sha)throw new Error('Remote source does not match build');
const archive=path.resolve(root,'..','mathflow-deploy.tar.gz');run('tar',['-czf',archive,'-C','dist','.']);
const entries=run('tar',['-tzf',archive]);if(!entries.includes('./server/index.js')||!entries.includes('./.openai/hosting.json'))throw new Error('Invalid archive');
console.log(JSON.stringify({project_id:manifest.project_id,commit_sha:sha,archive,checkout_path:root}));

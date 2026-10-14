import {env} from 'cloudflare:workers';
import {seed,type Store} from '@/app/data';
export function database(){if(!env.DB)throw new Error('数据库暂不可用，请稍后重试');return env.DB;}
export async function load(owner:string){const db=database();await db.prepare('INSERT OR IGNORE INTO workspaces (owner,data,revision) VALUES (?,?,0)').bind(owner,JSON.stringify(seed())).run();const row=await db.prepare('SELECT data,revision FROM workspaces WHERE owner=?').bind(owner).first<{data:string;revision:number}>();if(!row)throw new Error('无法读取教学空间');return {data:JSON.parse(row.data) as Store,revision:row.revision};}
export async function save(owner:string,data:Store,revision:number){const result=await database().prepare('UPDATE workspaces SET data=?,revision=revision+1 WHERE owner=? AND revision=?').bind(JSON.stringify(data),owner,revision).run();if(!result.meta.changes)throw new Error('数据已在另一页面更新，请刷新后重试');return {data,revision:revision+1};}

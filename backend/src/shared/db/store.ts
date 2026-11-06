import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
export const dataDir = path.resolve(process.env.DATA_DIR || '.data');
let pool: mysql.Pool | undefined;
export let databaseStatus = 'unconfigured';
export class DatabaseUnavailableError extends Error {
 status=503;code='DATABASE_UNAVAILABLE';
 constructor(){super('MySQL chưa kết nối. Vui lòng cấu hình thông tin database trong backend/.env.');}
}
export function getDatabase():mysql.Pool {if(!pool||databaseStatus!=='connected')throw new DatabaseUnavailableError();return pool;}
export const getPool=getDatabase;
export function markDatabaseUnavailable(){databaseStatus='unavailable';}
export function databaseError(error:unknown):never {
 const code=(error as {code?:string}).code;
 if(['ECONNREFUSED','PROTOCOL_CONNECTION_LOST','ETIMEDOUT','ER_ACCESS_DENIED_ERROR','ENOTFOUND','ER_NO_SUCH_TABLE','ER_BAD_DB_ERROR','ER_TABLEACCESS_DENIED_ERROR'].includes(code||'')){markDatabaseUnavailable();throw new DatabaseUnavailableError();}
 throw error;
}
export async function initDatabase() {
 if(pool){await pool.end().catch(()=>{});pool=undefined;}
 if(!process.env.MYSQL_USER) return;
 try {
  pool=mysql.createPool({host:process.env.MYSQL_HOST||'localhost',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'folio',password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE||'folio',connectTimeout:4000,connectionLimit:5});
  await pool.query('CREATE TABLE IF NOT EXISTS app_store (store_key VARCHAR(190) PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)'); databaseStatus='connected';
 } catch { databaseStatus='unavailable';if(pool)await pool.end().catch(()=>{});pool=undefined; }
}
export async function readStore<T>(key:string,fallback:T):Promise<T>{
 if(pool)try{const [rows]=await pool.query<mysql.RowDataPacket[]>('SELECT payload FROM app_store WHERE store_key=?',[key]);if(rows[0])return typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;}catch{databaseStatus='unavailable';}
 try{return JSON.parse(await fs.readFile(path.join(dataDir,`${key}.json`),'utf8'));}catch{return fallback;}
}
const writes = new Map<string,Promise<void>>();
export async function writeStore(key:string,value:unknown){
 const text=JSON.stringify(value);
 const pending=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
  await fs.mkdir(dataDir,{recursive:true});const file=path.join(dataDir,`${key}.json`);await fs.writeFile(file+'.tmp',text);await fs.rename(file+'.tmp',file);
  if(pool)try{await pool.query('INSERT INTO app_store(store_key,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[key,text]);}catch{databaseStatus='unavailable';}
 });writes.set(key,pending);await pending;
}

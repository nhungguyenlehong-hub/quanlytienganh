import type {RowDataPacket} from 'mysql2/promise';
import {getDatabase} from '../../shared/db/store.js';
import type {DictionaryCache,DictionaryEntry} from './types.js';
export const DICTIONARY_CACHE_VERSION=2;
export const DICTIONARY_SCHEMA=`CREATE TABLE IF NOT EXISTS dictionary_entries (
 word VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY,payload JSON NOT NULL,payload_version INT NOT NULL,
 expires_at DATETIME(3) NOT NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_dictionary_expiry(expires_at)
) ENGINE=InnoDB`;
// Dictionary lookups remain available if MySQL is temporarily unavailable.
// News storage policy remains DB-authoritative and is independent of this optional cache.
export class MysqlDictionaryCache implements DictionaryCache {
 private initialized:Promise<void>|null=null;
 private async ready(){
  if(!this.initialized)this.initialized=getDatabase().query(DICTIONARY_SCHEMA).then(()=>{}).catch(error=>{this.initialized=null;throw error;});
  await this.initialized;
 }
 async get(word:string){try{await this.ready();const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT payload,TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),expires_at)/1000 AS remaining_ms FROM dictionary_entries WHERE word COLLATE utf8mb4_bin=? AND payload_version=? AND expires_at>UTC_TIMESTAMP(3)',[word,DICTIONARY_CACHE_VERSION]);if(!rows[0])return null;
  const data=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;
  if(!data||!Object.hasOwn(data,'entry'))return null;
  const entry=data.entry as DictionaryEntry|null;
  if(entry&&(!['vi','en'].includes(entry.language)||!Array.isArray(entry.meanings)||!entry.meanings.length||typeof entry.meaning!=='string'||!Array.isArray(entry.attributions)))return null;
  // Compare in SQL against UTC to avoid host-local timezone assumptions.
  return {entry,expiresAt:Date.now()+Math.max(0,Number(rows[0].remaining_ms))};
 }catch{return null;}}
 async set(word:string,entry:DictionaryEntry|null,ttl:number){try{await this.ready();const expiry=new Date(Date.now()+ttl).toISOString().slice(0,23).replace('T',' ');
  await getDatabase().query('INSERT INTO dictionary_entries(word,payload,payload_version,expires_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),payload_version=VALUES(payload_version),expires_at=VALUES(expires_at)',[word,JSON.stringify({entry}),DICTIONARY_CACHE_VERSION,expiry]);
  // Bounded maintenance: never scan/delete an unbounded amount during a user lookup.
  await getDatabase().query('DELETE FROM dictionary_entries WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 100');
 }catch{/* A cache outage must not turn a successful dictionary lookup into a failure. */}}
}

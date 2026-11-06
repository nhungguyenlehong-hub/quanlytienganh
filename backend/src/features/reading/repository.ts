import type {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';

import {getDatabase,markDatabaseUnavailable,DatabaseUnavailableError} from '../../shared/db/store.js';
import type {Article} from './service.js';
export const RETENTION_DAYS=7;
export const retentionCutoff=(now=Date.now())=>new Date(now-RETENTION_DAYS*86400000);
export function isRecentArticle(date:string,now=Date.now()){const stamp=Date.parse(date);return Number.isFinite(stamp)&&stamp>=retentionCutoff(now).getTime()&&stamp<=now+300000;}
export type StoredImage={id:string;sourceUrl:string;contentType:string;hash:string;bytes:Buffer;alt:string;caption?:string};
export const NEWS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS articles (id VARCHAR(64) PRIMARY KEY, url VARCHAR(2048) NOT NULL, category VARCHAR(80) NOT NULL, published_at DATETIME(3) NOT NULL, content_hash CHAR(64) NOT NULL, record JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_articles_date(published_at), INDEX idx_articles_category_date(category,published_at)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS article_images (id CHAR(64) PRIMARY KEY, article_id VARCHAR(64) NOT NULL, source_url VARCHAR(2048) NOT NULL, content_type VARCHAR(100) NOT NULL, content_hash CHAR(64) NOT NULL, bytes LONGBLOB NOT NULL, alt TEXT, caption TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_images_article(article_id), CONSTRAINT fk_images_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS article_translations (article_id VARCHAR(64) NOT NULL, content_hash CHAR(64) NOT NULL, model VARCHAR(190) NOT NULL, target_language VARCHAR(16) NOT NULL DEFAULT 'vi', payload JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY(article_id,content_hash,model,target_language), CONSTRAINT fk_translations_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE) ENGINE=InnoDB`
];
function dbError(error:unknown):never {const e=error as {code?:string};if(['ECONNREFUSED','PROTOCOL_CONNECTION_LOST','ETIMEDOUT','ER_ACCESS_DENIED_ERROR','ENOTFOUND','ER_NO_SUCH_TABLE','ER_BAD_DB_ERROR','ER_TABLEACCESS_DENIED_ERROR'].includes(e.code||'')){markDatabaseUnavailable();throw new DatabaseUnavailableError();}throw error;}
export async function initNewsRepository(){try{for(const sql of NEWS_SCHEMA)await getDatabase().query(sql);}catch{markDatabaseUnavailable();throw new DatabaseUnavailableError();}}
const decode=<T>(value:any):T=>typeof value==='string'?JSON.parse(value):value;
const utcSql=(date:string|Date)=>new Date(date).toISOString().slice(0,23).replace('T',' ');
async function databaseConnection(){try{return await getDatabase().getConnection();}catch(error){dbError(error);}}
export async function findArticle(id:string):Promise<Article|null>{try{const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT record FROM articles WHERE id=? AND published_at>=?',[id,utcSql(retentionCutoff())]);return rows[0]?decode<Article>(rows[0].record):null;}catch(error){dbError(error);}}
export async function queryArticles(category?:string,q='',page=1){try{
 const clauses=['published_at>=?'];const values:unknown[]=[utcSql(retentionCutoff())];
 if(category&&category!=='all'){clauses.push('category=?');values.push(category);}
 if(q){clauses.push("(JSON_UNQUOTE(JSON_EXTRACT(record,'$.title')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(record,'$.description')) LIKE ?)");values.push(`%${q}%`,`%${q}%`);}
 const where=clauses.join(' AND ');const [count]=await getDatabase().query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM articles WHERE ${where}`,values);
 const [rows]=await getDatabase().query<RowDataPacket[]>(`SELECT record FROM articles WHERE ${where} ORDER BY published_at DESC,id ASC LIMIT 24 OFFSET ?`,[...values,(page-1)*24]);
 return {articles:rows.map(row=>decode<Article>(row.record)),total:Number(count[0].total),page};
 }catch(error){dbError(error);}}
export async function saveArticle(article:Article,images:StoredImage[],contentHash:string,connectionFactory?:()=>Promise<PoolConnection>){
 if(!isRecentArticle(article.publishedAt))return false;
 const connection=await (connectionFactory?connectionFactory():databaseConnection());try{await connection.beginTransaction();
  // Recheck on commit path: a long-running ingest must never resurrect an expired article.
  if(!isRecentArticle(article.publishedAt)){await connection.rollback();return false;}
  const [previous]=await connection.query<RowDataPacket[]>('SELECT content_hash FROM articles WHERE id=? FOR UPDATE',[article.id]);
  await connection.query('INSERT INTO articles(id,url,category,published_at,content_hash,record) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE url=VALUES(url),category=VALUES(category),published_at=VALUES(published_at),content_hash=VALUES(content_hash),record=VALUES(record)',[article.id,article.url,article.category,utcSql(article.publishedAt),contentHash,JSON.stringify(article)]);
  await connection.query('DELETE FROM article_images WHERE article_id=?',[article.id]);
  for(const image of images)await connection.query('INSERT INTO article_images(id,article_id,source_url,content_type,content_hash,bytes,alt,caption) VALUES(?,?,?,?,?,?,?,?)',[image.id,article.id,image.sourceUrl,image.contentType,image.hash,image.bytes,image.alt,image.caption||'']);
  if(previous[0]&&previous[0].content_hash!==contentHash)await connection.query('DELETE FROM article_translations WHERE article_id=?',[article.id]);
  await connection.commit();return true;
 }catch(error){await connection.rollback();dbError(error);}finally{connection.release();}
}
export async function loadImage(id:string){try{const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT i.bytes,i.content_type,i.content_hash FROM article_images i INNER JOIN articles a ON a.id=i.article_id WHERE i.id=? AND a.published_at>=?',[id,utcSql(retentionCutoff())]);return rows[0]?{bytes:rows[0].bytes as Buffer,contentType:rows[0].content_type as string,hash:rows[0].content_hash as string}:null;}catch(error){dbError(error);}}
export async function cleanupArticles(){try{const [result]=await getDatabase().query<ResultSetHeader>('DELETE FROM articles WHERE published_at<?',[utcSql(retentionCutoff())]);return result.affectedRows;}catch(error){dbError(error);}}
export async function hasMigrationMarker(){const [rows]=await getDatabase().query<RowDataPacket[]>("SELECT store_key FROM app_store WHERE store_key='news-db-migration-v1'");return rows.length>0;}
export async function markMigrationComplete(){await getDatabase().query("INSERT IGNORE INTO app_store(store_key,payload) VALUES('news-db-migration-v1',?)",[JSON.stringify({completedAt:new Date().toISOString()})]);}
export async function acquireIngestLock():Promise<PoolConnection|null>{const c=await databaseConnection();try{const [rows]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('lingopress-news-ingest',0) AS acquired");if(Number(rows[0]?.acquired)!==1){c.release();return null;}return c;}catch(e){c.release();dbError(e);}}
export async function releaseIngestLock(c:PoolConnection){try{await c.query("SELECT RELEASE_LOCK('lingopress-news-ingest')");}finally{c.release();}}

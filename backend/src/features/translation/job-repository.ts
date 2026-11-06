import {randomUUID,createHash} from 'node:crypto';
import type {RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {getDatabase} from '../../shared/db/store.js';
import {retentionCutoff} from '../reading/repository.js';
import type {Sentence,TranslationResult} from './service.js';
export interface TranslationJob {id:string;articleId:string;state:'queued'|'running'|'completed'|'failed';result?:TranslationResult;error?:string;createdAt:string;updatedAt:string}
export interface InternalJob extends TranslationJob {cacheKey:string;targetLanguage:string;model:string;sentences:Sentence[]}
export interface JobRepository {
 create(value:{articleId:string;cacheKey:string;model:string;targetLanguage:string;sentences:Sentence[]}):Promise<InternalJob>;
 get(id:string):Promise<InternalJob|null>;
 next():Promise<InternalJob|null>;
 complete(id:string,result:TranslationResult):Promise<void>;
 fail(id:string,message:string):Promise<void>;
 recover():Promise<void>;
 withWorkerLock(operation:()=>Promise<void>):Promise<void>;
}
export const TRANSLATION_JOB_SCHEMA=`CREATE TABLE IF NOT EXISTS translation_jobs (
 id CHAR(36) PRIMARY KEY, article_id VARCHAR(64) NOT NULL, cache_key CHAR(64) NOT NULL,
 model VARCHAR(190) NOT NULL, target_language VARCHAR(16) NOT NULL,
 state VARCHAR(16) NOT NULL, active_key CHAR(64) UNIQUE, source_sentences JSON NOT NULL,
 result JSON NULL, error TEXT NULL,
 created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX idx_translation_jobs_state(state,created_at),
 CONSTRAINT fk_translation_jobs_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB`;
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const cutoff=()=>retentionCutoff().toISOString().slice(0,23).replace('T',' ');
const map=(r:RowDataPacket):InternalJob=>({id:r.id,articleId:r.article_id,cacheKey:r.cache_key,targetLanguage:r.target_language,model:r.model,state:r.state,sentences:decode(r.source_sentences),...(r.result?{result:decode(r.result)}:{}),...(r.error?{error:r.error}:{}),createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});
export async function initializeTranslationJobTable(){await getDatabase().query(TRANSLATION_JOB_SCHEMA);}
export class MysqlTranslationJobRepository implements JobRepository {
 async create(value:{articleId:string;cacheKey:string;model:string;targetLanguage:string;sentences:Sentence[]}){
  const id=randomUUID();const activeKey=createHash('sha256').update(`${value.articleId}:${value.cacheKey}`).digest('hex');
  try{const [result]=await getDatabase().query<ResultSetHeader>(`INSERT INTO translation_jobs(id,article_id,cache_key,model,target_language,state,active_key,source_sentences)
   SELECT ?,id,?,?,?,'queued',?,? FROM articles WHERE id=? AND published_at>=?`,[id,value.cacheKey,value.model,value.targetLanguage,activeKey,JSON.stringify(value.sentences),value.articleId,cutoff()]);
   if(!result.affectedRows)throw Object.assign(new Error('Bài viết đã hết hạn.'),{status:404,code:'ARTICLE_NOT_FOUND'});
  }catch(error){if((error as {code?:string}).code!=='ER_DUP_ENTRY')throw error;
   const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT j.* FROM translation_jobs j JOIN articles a ON a.id=j.article_id WHERE j.active_key=? AND a.published_at>=?',[activeKey,cutoff()]);
   if(rows[0])return map(rows[0]);throw Object.assign(new Error('Bài viết đã hết hạn.'),{status:404,code:'ARTICLE_NOT_FOUND'});
  }
  return (await this.get(id))!;
 }
 async get(id:string){const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT j.* FROM translation_jobs j JOIN articles a ON a.id=j.article_id WHERE j.id=? AND a.published_at>=?',[id,cutoff()]);return rows[0]?map(rows[0]):null;}
 async next(){const [rows]=await getDatabase().query<RowDataPacket[]>("SELECT j.* FROM translation_jobs j JOIN articles a ON a.id=j.article_id WHERE j.state='queued' AND a.published_at>=? ORDER BY j.created_at LIMIT 1",[cutoff()]);if(!rows[0])return null;const job=map(rows[0]);await getDatabase().query("UPDATE translation_jobs SET state='running' WHERE id=? AND state='queued'",[job.id]);return {...job,state:'running' as const};}
 async complete(id:string,result:TranslationResult){const [rows]=await getDatabase().query<ResultSetHeader>("UPDATE translation_jobs j JOIN articles a ON a.id=j.article_id SET j.state='completed',j.result=?,j.error=NULL WHERE j.id=? AND j.state='running' AND a.published_at>=?",[JSON.stringify(result),id,cutoff()]);if(!rows.affectedRows)throw Object.assign(new Error('Bài viết đã hết hạn trước khi lưu tác vụ.'),{status:404,code:'ARTICLE_NOT_FOUND'});}
 async fail(id:string,message:string){await getDatabase().query("UPDATE translation_jobs SET state='failed',active_key=NULL,error=?,result=NULL WHERE id=? AND state IN ('queued','running')",[message.slice(0,2000),id]);}
 async recover(){await getDatabase().query("UPDATE translation_jobs SET state='failed',active_key=NULL,result=NULL,error='Backend khởi động lại khi đang dịch. Bấm Dịch để thử lại.' WHERE state='running'");}
 async withWorkerLock(operation:()=>Promise<void>){const connection=await getDatabase().getConnection();try{const [rows]=await connection.query<RowDataPacket[]>("SELECT GET_LOCK('lingopress-translation-worker',0) AS acquired");if(Number(rows[0]?.acquired)!==1)return;try{await operation();}finally{await connection.query("SELECT RELEASE_LOCK('lingopress-translation-worker')");}}finally{connection.release();}}
}

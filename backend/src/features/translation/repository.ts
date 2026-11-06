import type {RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
import {getDatabase,databaseError as dbError} from '../../shared/db/store.js';
import {retentionCutoff} from '../reading/repository.js';
const decode=<T>(value:any):T=>typeof value==='string'?JSON.parse(value):value;
const utcSql=(date:string|Date)=>new Date(date).toISOString().slice(0,23).replace('T',' ');
export type TranslationRecord={input:string[];output:string[];model:string};
export async function getArticleTranslation(articleId:string,cacheKey:string):Promise<TranslationRecord|null>{try{const [rows]=await getDatabase().query<RowDataPacket[]>('SELECT t.payload,t.model FROM article_translations t JOIN articles a ON a.id=t.article_id WHERE t.article_id=? AND t.content_hash=? AND a.published_at>=? ORDER BY t.updated_at DESC LIMIT 1',[articleId,cacheKey,utcSql(retentionCutoff())]);if(!rows[0])return null;return {...decode<TranslationRecord>(rows[0].payload),model:rows[0].model};}catch(error){dbError(error);}}
export async function saveArticleTranslation(value:TranslationRecord&{articleId:string;cacheKey:string}){try{const [result]=await getDatabase().query<ResultSetHeader>("INSERT INTO article_translations(article_id,content_hash,model,target_language,payload) SELECT id,?,?, 'vi',? FROM articles WHERE id=? AND published_at>=? ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=CURRENT_TIMESTAMP",[value.cacheKey,value.model,JSON.stringify({input:value.input,output:value.output,model:value.model,_writeId:randomUUID()}),value.articleId,utcSql(retentionCutoff())]);if(!result.affectedRows)throw Object.assign(new Error('Bài viết đã hết hạn hoặc bị xóa trước khi lưu bản dịch.'),{status:404,code:'ARTICLE_NOT_FOUND'});}catch(error){dbError(error);}}

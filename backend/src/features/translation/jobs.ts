import {AiError,publicAiError} from '../../shared/ai/provider.js';
import {TranslationService,splitSentences,validateSentences,translationIdentity,type TranslationResult} from './service.js';
import {MysqlTranslationJobRepository,type JobRepository,type InternalJob,type TranslationJob} from './job-repository.js';
type ArticleGetter=(id:string)=>Promise<{id:string;paragraphs:string[];contentStatus?:string}|null|undefined>;
type Translator=Pick<TranslationService,'translate'>;
export function publicJob(job:InternalJob):TranslationJob {
 const {id,articleId,state,result,error,createdAt,updatedAt}=job;return {id,articleId,state,...(result?{result}:{}),...(error?{error}:{}),createdAt,updatedAt};
}
export class TranslationJobs {
 private draining:Promise<void>|null=null;
 constructor(private getArticle:ArticleGetter,private translations:Translator=new TranslationService(),private repository:JobRepository=new MysqlTranslationJobRepository()){}
 async start(articleId:unknown,targetLanguage:unknown='vi'){
  if(typeof articleId!=='string'||!articleId||articleId.length>200)throw new AiError(400,'articleId không hợp lệ.');
  if(targetLanguage!=='vi')throw new AiError(400,'Bản MVP hỗ trợ dịch sang tiếng Việt (vi).');
  const article=await this.getArticle(articleId);if(!article)throw new AiError(404,'Không tìm thấy bài viết.');
  if(article.contentStatus!=='full'||!article.paragraphs.length)throw new AiError(422,'Bài viết chưa có toàn văn để dịch.');
  const sentences=validateSentences(splitSentences(article.paragraphs));const identity=translationIdentity(sentences);
  const job=await this.repository.create({articleId,...identity,targetLanguage:'vi',sentences});
  // Return immediately. The worker owns any long Gemini request/retries after this response.
  if(job.state==='queued')setTimeout(()=>void this.drain().catch(()=>{}),0).unref();
  return publicJob(job);
 }
 async get(id:string){if(!/^[a-f0-9-]{36}$/i.test(id))throw new AiError(404,'Không tìm thấy tác vụ dịch.');const job=await this.repository.get(id);if(!job)throw new AiError(404,'Tác vụ hoặc bài viết đã hết hạn.');return publicJob(job);}
 async drain(){
  if(this.draining)return this.draining;
  this.draining=this.repository.withWorkerLock(async()=>{
   // Exclusive DB lock proves no other instance is currently executing a translation.
   await this.repository.recover();
   while(true){const job=await this.repository.next();if(!job)break;
    try{const article=await this.getArticle(job.articleId);if(!article)throw new AiError(404,'Bài viết đã hết hạn.');
     const current=translationIdentity(validateSentences(splitSentences(article.paragraphs)),job.targetLanguage);
     if(current.cacheKey!==job.cacheKey)throw new AiError(409,'Nội dung hoặc model đã thay đổi. Bấm Dịch để tạo tác vụ mới.');
     const result:TranslationResult=await this.translations.translate(job.articleId,job.sentences,job.targetLanguage);
     await this.repository.complete(job.id,result);
    }catch(error){await this.repository.fail(job.id,publicAiError(error).error);}
   }
  }).finally(()=>{this.draining=null;});return this.draining;
 }
 startWorker(){void this.drain().catch(()=>{});const timer=setInterval(()=>void this.drain().catch(()=>{}),5000);timer.unref();return ()=>clearInterval(timer);}
}

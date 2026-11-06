import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {TranslationJobs} from '../src/features/translation/jobs.js';
import {createAiRouter} from '../src/features/translation/routes.js';
import {splitSentences,translationIdentity,type TranslationResult} from '../src/features/translation/service.js';
import {TRANSLATION_JOB_SCHEMA,type InternalJob,type JobRepository} from '../src/features/translation/job-repository.js';

function memoryRepository(){
 const jobs=new Map<string,InternalJob>();let locked=false;
 const repository:JobRepository={
  async create(input){const same=[...jobs.values()].find(job=>job.articleId===input.articleId&&job.cacheKey===input.cacheKey&&job.state!=='failed');if(same)return structuredClone(same);const now=new Date().toISOString();const job:InternalJob={...input,id:randomUUID(),state:'queued',createdAt:now,updatedAt:now};jobs.set(job.id,job);return structuredClone(job);},
  async get(id){const job=jobs.get(id);return job?structuredClone(job):null;},
  async next(){const job=[...jobs.values()].find(job=>job.state==='queued');if(!job)return null;job.state='running';return structuredClone(job);},
  async complete(id,result){const job=jobs.get(id)!;job.state='completed';job.result=result;},
  async fail(id,error){const job=jobs.get(id)!;job.state='failed';job.error=error;delete job.result;},
  async recover(){for(const job of jobs.values())if(job.state==='running'){job.state='failed';job.error='interrupted';}},
  async withWorkerLock(operation){if(locked)return;locked=true;try{await operation();}finally{locked=false;}},
 };return {repository,jobs};
}
const article={id:'article-a',paragraphs:['A complete story. Another sentence.'],contentStatus:'full'};
function result():TranslationResult{const translations=splitSentences(article.paragraphs).map(sentence=>({...sentence,translation:'Bản dịch.'}));return {translations,sentences:translations.map(({text,...sentence})=>({...sentence,original:text})),model:translationIdentity(translations).model,cached:false};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('start returns queued immediately, concurrent clicks deduplicate, polling does not regenerate, completed job is reused',async()=>{
 const {repository}=memoryRepository();let calls=0;let finish!:(result:TranslationResult)=>void;
 const deferred=new Promise<TranslationResult>(resolve=>{finish=resolve;});
 const jobs=new TranslationJobs(async()=>article,{translate:async()=>{calls++;return deferred;}},repository);
 const started=await Promise.all(Array.from({length:10},()=>jobs.start(article.id)));
 assert.equal(new Set(started.map(job=>job.id)).size,1);assert.equal(calls,0);assert.equal(started[0].state,'queued');
 const draining=jobs.drain();await tick();assert.equal(calls,1);assert.equal((await jobs.get(started[0].id)).state,'running');
 for(let i=0;i<20;i++)await jobs.get(started[0].id);assert.equal(calls,1);
 finish(result());await draining;
 assert.equal((await jobs.get(started[0].id)).state,'completed');assert.equal((await jobs.start(article.id)).id,started[0].id);assert.equal(calls,1);
});

test('failure is persisted; explicit retry creates new job instead of resuming a failed paid attempt automatically',async()=>{
 const {repository}=memoryRepository();let calls=0;
 const jobs=new TranslationJobs(async()=>article,{translate:async()=>{calls++;throw new Error('failure with no credentials');}},repository);
 const first=await jobs.start(article.id);await jobs.drain();const failed=await jobs.get(first.id);assert.equal(failed.state,'failed');assert(failed.error);assert.equal(calls,1);
 const second=await jobs.start(article.id);assert.notEqual(second.id,first.id);await jobs.drain();assert.equal(calls,2);
});

test('interrupted running jobs become failed under exclusive worker lock without another AI call',async()=>{
 const {repository,jobs:stored}=memoryRepository();let calls=0;const sentences=splitSentences(article.paragraphs);
 const old=await repository.create({articleId:article.id,...translationIdentity(sentences),targetLanguage:'vi',sentences});stored.get(old.id)!.state='running';
 const jobs=new TranslationJobs(async()=>article,{translate:async()=>{calls++;return result();}},repository);await jobs.drain();assert.equal((await jobs.get(old.id)).state,'failed');assert.equal(calls,0);
});

test('expired or changed source never dispatches an obsolete queued translation',async()=>{
 const {repository}=memoryRepository();let current:typeof article|null=article;let calls=0;
 const jobs=new TranslationJobs(async()=>current,{translate:async()=>{calls++;return result();}},repository);
 const first=await jobs.start(article.id);current=null;await jobs.drain();assert.equal((await jobs.get(first.id)).state,'failed');assert.equal(calls,0);
 current=article;const second=await jobs.start(article.id);current={...article,paragraphs:['Changed whole article.']};await jobs.drain();assert.equal((await jobs.get(second.id)).state,'failed');assert.equal(calls,0);
});

test('translation job data is article-owned and cascades with the seven-day article cleanup',()=>{
 assert.match(TRANSLATION_JOB_SCHEMA,/FOREIGN KEY\(article_id\) REFERENCES articles\(id\) ON DELETE CASCADE/);
 assert.match(TRANSLATION_JOB_SCHEMA,/active_key CHAR\(64\) UNIQUE/);
});

test('HTTP start is202 while provider is pending; status requests return short DB results without exposing source internals',async()=>{
 const {repository}=memoryRepository();let finish!:(result:TranslationResult)=>void;
 const deferred=new Promise<TranslationResult>(resolve=>{finish=resolve;});const jobs=new TranslationJobs(async()=>article,{translate:()=>deferred},repository);
 const app=express();app.use(express.json());app.use('/api/ai',createAiRouter({getArticle:async()=>article,requireAuth:(_req,_res,next)=>next(),translationJobs:jobs}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as AddressInfo).port;
 try{const response=await fetch(`http://127.0.0.1:${port}/api/ai/translation-jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId:article.id,targetLanguage:'vi'})});assert.equal(response.status,202);const body=await response.json() as any;assert(body.job.id);assert.equal(body.job.sentences,undefined);assert.equal(body.job.cacheKey,undefined);
  const status=await fetch(`http://127.0.0.1:${port}/api/ai/translation-jobs/${body.job.id}`);assert.equal(status.status,200);assert(['queued','running'].includes(((await status.json()) as any).job.state));
 }finally{finish(result());await jobs.drain();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import type {RowDataPacket} from 'mysql2/promise';
import {dataDir,getDatabase} from '../../shared/db/store.js';
import {categories,allowedBbcUrl,fetchBbc,extractArticle,segment,type Article} from './service.js';
import {acquireIngestLock,releaseIngestLock,cleanupArticles,findArticle,saveArticle,hasMigrationMarker,markMigrationComplete,isRecentArticle,RETENTION_DAYS,type StoredImage} from './repository.js';
export type NewsJob={state:'idle'|'queued'|'running'|'completed'|'failed';startedAt?:string;finishedAt?:string;nextRunAt?:string;error?:string;feedErrors?:string[];retentionDays:number;progress:{discovered:number;processed:number;saved:number;failed:number;deleted:number}};
let job:NewsJob={state:'idle',retentionDays:RETENTION_DAYS,progress:{discovered:0,processed:0,saved:0,failed:0,deleted:0}};
let running:Promise<void>|null=null;
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function getNewsJob(){return structuredClone(job);}
export function allowedImageUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&['ichef.bbci.co.uk','ichef.bbci.co.uk.edgesuite.net','ichef.bbc.co.uk','images.bbc.co.uk','news.bbcimg.co.uk'].includes(u.hostname);}catch{return false;}}
const MAX_IMAGE_BYTES=8*1024*1024;
export async function readImageResponse(response:Response){
 const contentType=(response.headers.get('content-type')||'').split(';')[0].trim();
 if(!['image/jpeg','image/png','image/webp','image/avif','image/gif'].includes(contentType))throw new Error('Unsupported image content type');
 if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new Error('Image exceeds 8MB');
 if(!response.body)throw new Error('Empty image response');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new Error('Image exceeds 8MB');}chunks.push(value);}}finally{reader.releaseLock();}
 if(!size)throw new Error('Empty image response');return {bytes:Buffer.concat(chunks),contentType};
}
export async function downloadImage(articleId:string,image:Article['images'][number]):Promise<StoredImage>{
 const sourceUrl=image.sourceUrl||image.url;let url=sourceUrl;
 for(let redirects=0;redirects<4;redirects++){
  if(!allowedImageUrl(url))throw new Error('Untrusted image origin');
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'LingoPress/1.0'}});
  if(response.status>=300&&response.status<400){url=new URL(response.headers.get('location')||'',url).href;continue;}
  if(!response.ok)throw new Error(`Image HTTP ${response.status}`);
  const {bytes,contentType}=await readImageResponse(response);return {id:hash(`${articleId}\n${sourceUrl}`),sourceUrl,contentType,hash:hash(bytes),bytes,alt:image.alt||'',caption:image.caption};
 }throw new Error('Too many image redirects');
}
export async function boundedMap<T>(values:T[],concurrency:number,operation:(value:T)=>Promise<void>){let cursor=0;await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),values.length)},async()=>{while(cursor<values.length){const value=values[cursor++];await operation(value);}}));}
async function discoverRss(){
 const parser=new Parser({customFields:{item:[['media:thumbnail','thumbnail'],['media:content','media']]}});const found=new Map<string,Article>();const failures:string[]=[];
 await boundedMap(categories,3,async category=>{try{
  const feed=await parser.parseString(await fetchBbc(category.feedUrl));
  for(const item of feed.items){
   if(!item.link||!allowedBbcUrl(item.link))continue;const url=new URL(item.link);url.search='';url.hash='';
   if(!/^\/(news|sport)\//.test(url.pathname)||/\/(videos|av|live)\//.test(url.pathname))continue;
   const publishedAt=item.isoDate||item.pubDate||'';if(!isRecentArticle(publishedAt))continue;
   const id=hash(url.href).slice(0,20);if(found.has(id))continue;
   const image=String((item as any).thumbnail?.$?.url||(item as any).media?.$?.url||'').replace('/standard/240/','/standard/1024/');
   found.set(id,{id,title:item.title||'BBC News',description:cheerio.load(item.contentSnippet||item.content||'').text().replace(/\s+/g,' ').trim(),url:url.href,image,imageUrl:image,publishedAt:new Date(publishedAt).toISOString(),category:category.id,source:'BBC News',paragraphs:[],images:[],sentences:[],contentStatus:'summary_only'});
  }
 }catch{failures.push(category.id);}});
 return {articles:[...found.values()],failures};
}
async function importLegacyCandidates(){
 if(await hasMigrationMarker())return null;
 const candidates=new Map<string,Article>();
 const [rows]=await getDatabase().query<RowDataPacket[]>("SELECT payload FROM app_store WHERE store_key='articles'");
 const values:unknown[]=[];
 if(rows[0])try{values.push(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload);}catch{}
 const file=path.join(dataDir,'articles.json');try{values.push(JSON.parse(await fs.readFile(file,'utf8')));}catch{}
 for(const value of values)if(Array.isArray(value))for(const article of value){if(article&&typeof article.id==='string'&&allowedBbcUrl(article.url)&&isRecentArticle(article.publishedAt))candidates.set(article.id,article);}
 // Expired legacy data is removed immediately, including on a failed migration.
 if(rows[0])await getDatabase().query("UPDATE app_store SET payload=? WHERE store_key='articles'",[JSON.stringify([...candidates.values()])]);
 try{await fs.access(file);await fs.writeFile(file,JSON.stringify([...candidates.values()]));}catch{}
 return [...candidates.values()];
}
async function retireLegacy(){await markMigrationComplete();await getDatabase().query("DELETE FROM app_store WHERE store_key='articles'");await fs.rm(path.join(dataDir,'articles.json'),{force:true});}
async function ingestArticle(candidate:Article){
 if(!isRecentArticle(candidate.publishedAt))return false;
 const existing=await findArticle(candidate.id);
 if(existing?.contentStatus==='full'&&existing.imagesComplete){return false;}
 const article:Article={...candidate,images:[],paragraphs:[],sentences:[]};
 try{
  const extracted=extractArticle(await fetchBbc(candidate.url));Object.assign(article,extracted,{sentences:segment(extracted.paragraphs),contentStatus:extracted.paragraphs.length?'full':'summary_only',fetchedAt:new Date().toISOString()});
  if(!article.paragraphs.length)article.error='BBC did not expose readable article text.';
 }catch(error){article.error=error instanceof Error?error.message:'Article fetch failed';article.contentStatus='summary_only';}
 const sources=article.images.length?article.images:(candidate.image?[{url:candidate.image,alt:candidate.title}]:[]);
 const stored:StoredImage[]=[];const localImages:Article['images']=[];
 // Article concurrency is bounded globally; image requests stay sequential per article.
 for(const image of sources){const sourceUrl=image.sourceUrl||image.url;if(!sourceUrl)continue;try{
  const downloaded=await downloadImage(article.id,{...image,sourceUrl});stored.push(downloaded);localImages.push({url:`/api/images/${downloaded.id}`,sourceUrl,alt:downloaded.alt,caption:downloaded.caption});
 }catch(error){localImages.push({url:'',sourceUrl,alt:image.alt||'',caption:image.caption,downloadError:error instanceof Error?error.message:'Image download failed'});}}
 article.images=localImages;article.imagesComplete=localImages.every(image=>!image.downloadError);article.image=article.imageUrl=localImages.find(image=>image.url)?.url||'';
 article.contentHash=hash(JSON.stringify(article.paragraphs));
 const saved=await saveArticle(article,stored,article.contentHash);
 if(saved&&(article.contentStatus!=='full'||!article.imagesComplete))throw new Error('Article content or images are incomplete; retry during the next ingest.');
 return saved;
}
async function persistStatus(){try{await getDatabase().query("INSERT INTO app_store(store_key,payload) VALUES('news-job-status',?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",[JSON.stringify(job)]);}catch{/* In-memory failure status remains visible while database is unavailable. */}}
async function executeJob(){
 let lock:Awaited<ReturnType<typeof acquireIngestLock>>=null;
 job={state:'running',startedAt:new Date().toISOString(),nextRunAt:job.nextRunAt,retentionDays:RETENTION_DAYS,progress:{discovered:0,processed:0,saved:0,failed:0,deleted:0}};
 try{
  lock=await acquireIngestLock();if(!lock)throw new Error('Một tiến trình khác đang đồng bộ tin tức.');await persistStatus();
  job.progress.deleted+=await cleanupArticles();
  const legacy=await importLegacyCandidates();const discovered=await discoverRss();job.feedErrors=discovered.failures;
  const all=new Map<string,Article>();for(const a of [...(legacy||[]),...discovered.articles])all.set(a.id,a);
  const candidates=[...all.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));job.progress.discovered=candidates.length;
  let legacyFailed=false;const legacyIds=new Set(legacy?.map(a=>a.id)||[]);
  await boundedMap(candidates,3,async article=>{try{if(await ingestArticle(article))job.progress.saved++;}catch{job.progress.failed++;if(legacyIds.has(article.id))legacyFailed=true;}finally{job.progress.processed++;if(job.progress.processed%10===0)await persistStatus();}});
  if(legacy&&!legacyFailed)await retireLegacy();
  if(discovered.failures.length===categories.length)throw new Error('Không tải được các RSS BBC. Dữ liệu đã lưu vẫn đọc được.');
  if(job.progress.failed)throw new Error(`${job.progress.failed} bài chưa lưu thành công. Các bài còn lại đã được lưu.`);
  job.state='completed';
 }catch(error){job.state='failed';job.error=error instanceof Error?error.message:'News ingest failed';}
 finally{
  // Enforce retention even if RSS fetching or extraction fails.
  if(lock){try{job.progress.deleted+=await cleanupArticles();}catch(error){job.state='failed';job.error=error instanceof Error?error.message:'Retention cleanup failed';}}
  job.finishedAt=new Date().toISOString();await persistStatus();if(lock)await releaseIngestLock(lock).catch(()=>{});
 }
}
export function queueNewsIngest(){getDatabase();if(running)return getNewsJob();job={...job,state:'queued',error:undefined};running=new Promise<void>(resolve=>setTimeout(resolve,0)).then(executeJob).finally(()=>{running=null;});return getNewsJob();}
export async function initializeNewsJobs(){
 const [rows]=await getDatabase().query<RowDataPacket[]>("SELECT payload FROM app_store WHERE store_key='news-job-status'");
 if(rows[0]){const saved=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;job={...job,...saved};if(['queued','running'].includes(job.state)){job.state='failed';job.error='Lần đồng bộ trước bị gián đoạn; sẽ thử lại khi khởi động.';}}
}
export function startNewsScheduler(){
 let timer:ReturnType<typeof setTimeout>;
 const schedule=()=>{const next=new Date();next.setUTCHours(2,0,0,0);if(next.getTime()<=Date.now())next.setUTCDate(next.getUTCDate()+1);job.nextRunAt=next.toISOString();timer=setTimeout(()=>{try{queueNewsIngest();}catch(error){job.state='failed';job.error=error instanceof Error?error.message:'Database unavailable';}schedule();},next.getTime()-Date.now());timer.unref();};
 schedule();try{queueNewsIngest();}catch(error){job.state='failed';job.error=error instanceof Error?error.message:'Database unavailable';}
 return ()=>clearTimeout(timer);
}

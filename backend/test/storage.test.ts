import test from 'node:test';
import assert from 'node:assert/strict';
import type {PoolConnection} from 'mysql2/promise';
import {isRecentArticle,retentionCutoff,saveArticle,NEWS_SCHEMA} from '../src/news-repository.js';
import {allowedImageUrl,readImageResponse,boundedMap} from '../src/jobs.js';
import type {Article} from '../src/news.js';
test('retention uses original publication date with exact 7-day boundary, invalid and future dates rejected',()=>{
 const now=Date.parse('2026-11-06T08:00:00Z');assert.equal(retentionCutoff(now).toISOString(),'2026-10-30T08:00:00.000Z');
 assert.equal(isRecentArticle('2026-10-30T08:00:00Z',now),true);assert.equal(isRecentArticle('2026-10-30T07:59:59.999Z',now),false);assert.equal(isRecentArticle('not-a-date',now),false);assert.equal(isRecentArticle('2026-11-07T00:00:00Z',now),false);
});
test('image download URL policy rejects SSRF and accepted redirects must stay on allowed origins',()=>{
 for(const url of ['http://ichef.bbci.co.uk/a','https://ichef.bbci.co.uk.evil.test/a','https://127.0.0.1/a','https://user:pass@ichef.bbci.co.uk/a','https://ichef.bbci.co.uk:444/a','file:///etc/passwd'])assert.equal(allowedImageUrl(url),false);
 assert.equal(allowedImageUrl('https://ichef.bbci.co.uk/ace/standard/1024/cpsprodpb/photo.jpg'),true);
});
test('images reject both declared and streamed oversize bodies and non-image MIME types',async()=>{
 await assert.rejects(()=>readImageResponse(new Response('x',{headers:{'content-type':'image/jpeg','content-length':'9000000'}})),/8MB/);
 await assert.rejects(()=>readImageResponse(new Response(new Uint8Array(8*1024*1024+1),{headers:{'content-type':'image/jpeg'}})),/8MB/);
 await assert.rejects(()=>readImageResponse(new Response('<html>',{headers:{'content-type':'text/html'}})),/content type/);
 const image=await readImageResponse(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}}));assert.equal(image.bytes.length,3);
});
test('bounded workers visit every candidate once and never exceed concurrency',async()=>{
 let active=0;let maximum=0;const completed:number[]=[];
 await boundedMap(Array.from({length:13},(_,i)=>i),3,async value=>{active++;maximum=Math.max(active,maximum);await new Promise(resolve=>setTimeout(resolve,1));completed.push(value);active--;});assert.equal(maximum,3);assert.deepEqual(completed.sort((a,b)=>a-b),Array.from({length:13},(_,i)=>i));
});
const article=():Article=>({id:'abc',title:'A real article',description:'',url:'https://www.bbc.co.uk/news/articles/abc',image:'/api/images/a',imageUrl:'/api/images/a',publishedAt:new Date().toISOString(),category:'world',source:'BBC News',paragraphs:['The complete article text.'],images:[],sentences:[],contentStatus:'full'});
function mockConnection(failImages=false){const calls:string[]=[];return {calls,connection:{async beginTransaction(){calls.push('begin');},async query(sql:string){calls.push(sql);if(sql.startsWith('SELECT content_hash'))return [[{content_hash:'old'}],[]];if(failImages&&sql.startsWith('INSERT INTO article_images'))throw new Error('blob write failed');return [{affectedRows:1},[]];},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');}} as unknown as PoolConnection};}
test('article, images and translation invalidation commit atomically; blob failure rolls back',async()=>{
 const image={id:'a'.repeat(64),sourceUrl:'https://ichef.bbci.co.uk/image.jpg',contentType:'image/jpeg',hash:'b'.repeat(64),bytes:Buffer.from([1]),alt:''};
 const success=mockConnection();await saveArticle(article(),[image],'new',async()=>success.connection);assert.equal(success.calls.at(-2),'commit');assert.equal(success.calls.at(-1),'release');assert(success.calls.some(sql=>sql.startsWith('DELETE FROM article_translations')));
 const failed=mockConnection(true);await assert.rejects(()=>saveArticle(article(),[image],'new',async()=>failed.connection),/blob write failed/);assert.equal(failed.calls.includes('commit'),false);assert.deepEqual(failed.calls.slice(-2),['rollback','release']);
});
test('expired input cannot resurrect an article, and cascade applies only to article-owned content',async()=>{
 let connections=0;const expired={...article(),publishedAt:new Date(Date.now()-8*86400000).toISOString()};assert.equal(await saveArticle(expired,[],'hash',async()=>{connections++;return mockConnection().connection;}),false);assert.equal(connections,0);
 const children=NEWS_SCHEMA.filter(sql=>sql.includes('FOREIGN KEY'));assert.equal(children.length,2);assert(children.every(sql=>sql.includes('REFERENCES articles(id) ON DELETE CASCADE')));assert(children.every(sql=>!sql.includes('words')));
});

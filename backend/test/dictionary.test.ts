import test from 'node:test';
import assert from 'node:assert/strict';
import {DictionaryService,normalizeWord,VI_TTL,EN_TTL,NEGATIVE_TTL} from '../src/features/dictionary/service.js';
import {parsePrimary,parseWiktionary,parseEnglish,ProviderHttpError} from '../src/features/dictionary/providers.js';
import type {DictionaryCache,DictionaryEntry} from '../src/features/dictionary/types.js';
const primary={exists:true,word:'book',results:[{lang_code:'en',audio:'/api/v1/tts?word=book&lang=en',meanings:[{definition:'Sách.',definition_lang:'vi',example:'old book',pos:'Danh từ',source:'Wiktionary'},{definition:'Đặt chỗ.',definition_lang:'vi',pos:'Động từ',source:'Wiktionary'},{definition:'A written work.',definition_lang:'en',pos:'noun',source:'Wiktionary EN'}],pronunciations:[{ipa:'/bʊk/'}]}]};
const english=[{word:'book',meanings:[{partOfSpeech:'noun',definitions:[{definition:'A written work.'}]}],license:{name:'CC BY-SA 3.0'},sourceUrls:['https://en.wiktionary.org/wiki/book']}];
const wiki={parse:{title:'book',text:`<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2 id="Tiếng_Pháp">Tiếng Pháp</h2></div><h3>Danh từ</h3><ol><li>WRONG FRENCH</li></ol><div class="mw-heading mw-heading2"><h2 id="Tiếng_Anh">Tiếng Anh</h2></div><div class="mw-heading mw-heading3"><h3>Cách phát âm</h3></div><span class="IPA">/bʊk/</span><audio data-mwtitle="En-us-book.ogg"><source src="//upload.wikimedia.org/wikipedia/commons/en-book.mp3"></audio><div class="mw-heading mw-heading3"><h3>Danh từ</h3></div><ol><li><a>Sách</a>.<dl><dd><i>old book</i> — sách cũ</dd></dl></li></ol><div class="mw-heading mw-heading4"><h4>Từ dẫn xuất</h4></div><ol><li>NOT A DEFINITION</li></ol><div class="mw-heading mw-heading3"><h3>Ngoại động từ</h3></div><ol><li>Đặt chỗ.</li></ol><div class="mw-heading mw-heading2"><h2 id="Tiếng_Hà_Lan">Tiếng Hà Lan</h2></div><h3>Danh từ</h3><ol><li>WRONG DUTCH</li></ol></div>`}};
function emptyCache():DictionaryCache{return {get:async()=>null,set:async()=>{}};}
function memoryCache(now:()=>number=Date.now){const records=new Map<string,{entry:DictionaryEntry|null;expiresAt:number;ttl:number}>();const cache:DictionaryCache={get:async word=>records.get(word)||null,set:async(word,entry,ttl)=>{records.set(word,{entry,expiresAt:now()+ttl,ttl});}};return {cache,records};}

test('normalizes selected punctuation, uppercase and curly apostrophes, preserving real inflections',()=>{
 assert.equal(normalizeWord(' “STORAGE,” '),'storage');assert.equal(normalizeWord('Reader’s'),'reader\'s');assert.equal(normalizeWord('Reading'),'reading');assert.equal(normalizeWord('went'),'went');assert.equal(normalizeWord('BOOKS'),'books');
 for(const value of ['',null,{},'123','ISO9001','hello/world','<script>alert(1)</script>','a'.repeat(81)])assert.throws(()=>normalizeWord(value));
});
test('primary provider accepts only English terms with Vietnamese definitions, provenance and declared IPA/audio',()=>{
 const value=parsePrimary(primary,'book')!;assert.equal(value.language,'vi');assert.equal(value.meaning,'Sách.');assert.equal(value.meanings.length,2);assert.equal(value.phonetic,'/bʊk/');assert.match(value.audio,/^https:\/\/dict\.minhqnd\.com\/api\/v1\/tts/);assert.equal(value.meanings[0].definitions[0].example,'old book');assert(value.attributions.some(a=>a.name==='Wiktionary'));
 assert.equal(parsePrimary({exists:true,results:[{lang_code:'vi',meanings:[{definition:'Sai.',definition_lang:'vi'}]}]},'book'),null);
 assert.equal(parsePrimary({exists:true,results:[{lang_code:'en',meanings:[{definition:'English only',definition_lang:'en'}]}]},'book'),null);
 assert.equal(parsePrimary({exists:true,results:[{lang_code:'en',meanings:[{definition:'Missing language'}]}]},'book'),null);
 assert.equal(parsePrimary({exists:true},'book'),null);
});
test('strips remote markup and rejects audio on arbitrary hosts',()=>{
 const dirty=structuredClone(primary);dirty.results[0].meanings[0].definition='<b>Sách</b>.';dirty.results[0].audio='https://evil.test/audio';const value=parsePrimary(dirty,'book')!;assert.equal(value.meaning,'Sách.');assert.equal(value.audio,'');assert(!JSON.stringify(value).includes('<b>'));
 const sparse=parsePrimary({exists:true,results:[{lang_code:'en',meanings:[{definition:'Sách.',definition_lang:'vi',source:'Hồ Ngọc Đức'}]}]},'book')!;assert.equal(sparse.phonetic,'');assert.equal(sparse.audio,'');assert.match(sparse.attributions[1].license!,/GPL/);
});
test('Wiktionary extracts ONLY English section and POS gloss lists; examples, IPA and audio remain attributed',()=>{
 const value=parseWiktionary(wiki,'book')!;assert.equal(value.language,'vi');assert.equal(value.meanings.length,2);assert.equal(value.meanings[0].definitions[0].definition,'Sách.');assert.equal(value.meanings[0].definitions[0].example,'old book — sách cũ');assert.equal(value.meanings[1].partOfSpeech,'Ngoại động từ');assert.equal(value.phonetic,'/bʊk/');assert.match(value.audio,/^https:\/\/upload\.wikimedia\.org\//);assert(!JSON.stringify(value).includes('WRONG'));assert(!JSON.stringify(value).includes('NOT A DEFINITION'));
 assert.equal(parseWiktionary({parse:{text:'<h2>Tiếng Pháp</h2><h3>Danh từ</h3><ol><li>Pas anglais</li></ol>'}},'book'),null);
 assert.equal(parseWiktionary({error:{code:'missingtitle'}},'book'),null);
});
test('primary misses and outages prefer Vietnamese fallback before explicit Anh–Anh fallback',async()=>{
 const called:string[]=[];const service=new DictionaryService(async url=>{called.push(url);if(url.includes('dict.minhqnd'))throw new TypeError('network failure');if(url.includes('vi.wiktionary'))return wiki;return english;},emptyCache());
 const value=await service.lookup('book');assert.equal(value.language,'vi');assert.equal(value.source,'Wiktionary tiếng Việt');assert.equal(called.filter(url=>url.includes('dict.minhqnd')).length,2);assert(!called.some(url=>url.includes('dictionaryapi.dev')));
 const fallback=new DictionaryService(async url=>url.includes('dictionaryapi.dev')?english:{exists:false},emptyCache());const en=await fallback.lookup('book');assert.equal(en.language,'en');assert.match(en.source,/Anh–Anh/);assert.equal(parseEnglish({meaning:'wrong shape'},'book'),null);
});
test('concurrent normalized lookups share one provider request, memory is bounded and MySQL cache is reused',async()=>{
 let calls=0;const {cache,records}=memoryCache();const fetcher=async()=>{calls++;return primary;};const service=new DictionaryService(fetcher,cache);
 const values=await Promise.all(['BOOK','book,','“Book”','book'].map(word=>service.lookup(word)));assert(values.every(value=>value.meaning==='Sách.'));assert.equal(calls,1);assert.equal(records.get('book')?.ttl,VI_TTL);
 const nextProcess=new DictionaryService(fetcher,cache);await nextProcess.lookup('book');assert.equal(calls,1);
 let boundedCalls=0;const bounded=new DictionaryService(async()=>{boundedCalls++;return primary;},emptyCache(),Date.now,2);await bounded.lookup('book');await bounded.lookup('read');await bounded.lookup('work');await bounded.lookup('book');assert.equal(boundedCalls,4);
});
test('negative cache is short, expiries are honored, network failure is never negative-cached',async()=>{
 let now=1000;let calls=0;const {cache,records}=memoryCache(()=>now);const missing=new DictionaryService(async()=>{calls++;throw new ProviderHttpError(404);},cache,()=>now);
 await assert.rejects(missing.lookup('notaword'),{status:404});const initial=calls;await assert.rejects(missing.lookup('notaword'),{status:404});assert.equal(calls,initial);assert.equal(records.get('notaword')?.ttl,NEGATIVE_TTL);now+=NEGATIVE_TTL+1;await assert.rejects(missing.lookup('notaword'),{status:404});assert(calls>initial);
 let outageCalls=0;const outage=new DictionaryService(async()=>{outageCalls++;throw new TypeError('network');},emptyCache());await assert.rejects(outage.lookup('book'),{status:502});const before=outageCalls;await assert.rejects(outage.lookup('book'),{status:502});assert(outageCalls>before);
 const malformedCache=memoryCache();const malformed=new DictionaryService(async()=>({}),malformedCache.cache);await assert.rejects(malformed.lookup('book'),{status:502});assert.equal(malformedCache.records.size,0);
});
test('dictionary still works when MySQL cache is unavailable; English fallback has shorter expiry',async()=>{
 const broken:DictionaryCache={get:async()=>{throw new Error('db down');},set:async()=>{throw new Error('db down');}};
 assert.equal((await new DictionaryService(async()=>primary,broken).lookup('book')).language,'vi');
 const {cache,records}=memoryCache();const fallback=new DictionaryService(async url=>url.includes('dictionaryapi.dev')?english:{exists:false},cache);await fallback.lookup('book');assert.equal(records.get('book')?.ttl,EN_TTL);
});

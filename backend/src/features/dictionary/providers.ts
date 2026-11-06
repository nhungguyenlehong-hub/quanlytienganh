import * as cheerio from 'cheerio';
import type {DictionaryDefinition,DictionaryEntry,DictionaryMeaning} from './types.js';
const PRIMARY='https://dict.minhqnd.com';
const CC='CC BY-SA 4.0';
const text=(value:unknown,limit=1600)=>typeof value==='string'?cheerio.load(value).text().replace(/\s+/g,' ').trim().slice(0,limit):'';
const wikiUrl=(word:string)=>`https://vi.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g,'_'))}`;
function safeAudio(value:unknown,base:string,hosts:string[]){if(typeof value!=='string'||value.length>1500)return '';try{const url=new URL(value,base);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.includes(url.hostname)?url.href:'';}catch{return '';}}
const provenance=(name:string,word:string)=>{
 if(/wiktionary|wikipedia/i.test(name))return {name,url:wikiUrl(word),license:CC};
 if(/hồ ngọc đức|free vietnamese|tudientv|explanatory/i.test(name))return {name,url:PRIMARY,license:'GNU GPL (theo nguồn gốc)'};
 if(/thông dụng|tvtd/i.test(name))return {name,url:'https://github.com/vntk/dictionary',license:'MIT'};
 return {name:name||'Nguồn từ điển gốc',url:PRIMARY,license:'Xem giấy phép nguồn gốc tại nhà cung cấp'};
};
function entry(word:string,headword:string,meanings:DictionaryMeaning[],metadata:Pick<DictionaryEntry,'language'|'source'|'sourceUrl'|'license'|'attributions'>,phonetic='',audio=''):DictionaryEntry|null{
 const filtered=meanings.map(m=>({...m,definitions:m.definitions.slice(0,12)})).filter(m=>m.definitions.length).slice(0,8);if(!filtered.length)return null;
 const definition=filtered[0].definitions[0].definition;
 return {word,...(headword&&headword!==word?{headword}:{}),meanings:filtered,phonetic,audio,meaning:definition,definition,partOfSpeech:filtered[0].partOfSpeech,...metadata};
}
export function parsePrimary(value:unknown,word:string):DictionaryEntry|null{
 const data=value as any;if(!data||data.exists!==true||!Array.isArray(data.results))return null;
 const english=data.results.filter((result:any)=>result&&result.lang_code==='en'&&Array.isArray(result.meanings));
 const meanings=new Map<string,DictionaryDefinition[]>();const sources=new Map<string,ReturnType<typeof provenance>>();
 for(const result of english)for(const item of result.meanings.slice(0,120)){
  if(item?.definition_lang!=='vi')continue;const definition=text(item.definition);if(!definition)continue;
  const partOfSpeech=text(item.pos,100)||'Khác';const source=text(item.source,150)||'Nguồn từ điển gốc';const attribution=provenance(source,word);sources.set(source,attribution);
  const list=meanings.get(partOfSpeech)||[];if(!list.some(existing=>existing.definition===definition))list.push({definition,...(text(item.example,1000)?{example:text(item.example,1000)}:{}),source,license:attribution.license});meanings.set(partOfSpeech,list);
 }
 const pronunciations=english.flatMap((result:any)=>Array.isArray(result.pronunciations)?result.pronunciations:[]);
 const phonetic=text(pronunciations.find((p:any)=>typeof p?.ipa==='string'&&p.ipa.trim())?.ipa,150);
 const audio=safeAudio(english.find((result:any)=>result.audio)?.audio,PRIMARY,['dict.minhqnd.com']);
 return entry(word,text(data.word,100),[...meanings].map(([partOfSpeech,definitions])=>({partOfSpeech,definitions})),{language:'vi',source:'@minhqnd Dictionary',sourceUrl:PRIMARY,license:CC,attributions:[{name:'@minhqnd',url:PRIMARY,license:CC},...sources.values()]},phonetic,audio);
}
export function parseWiktionary(value:unknown,word:string):DictionaryEntry|null{
 const data=value as any;if(!data?.parse||typeof data.parse.text!=='string')return null;
 const $=cheerio.load(data.parse.text);$('script,style,.mw-editsection,.reference').remove();
 const start=$('h2').filter((_,el)=>$(el).attr('id')==='Tiếng_Anh'||$(el).find('[id="Tiếng_Anh"]').length>0||$(el).find('[data-iso="eng"]').length>0||$(el).text().trim()==='Tiếng Anh').first();if(!start.length)return null;
 // MediaWiki emits both old plain h2 and newer .mw-heading wrappers.
 const top=start.parent().hasClass('mw-heading')?start.parent():start;
 const fragment=$('<div></div>');let node=top.next();
 while(node.length){if(node.is('h2')||node.children('h2').length)break;fragment.append(node.clone());node=node.next();}
 const meanings:DictionaryMeaning[]=[];let partOfSpeech='';
 const parts=/^(danh từ|động từ|ngoại động từ|nội động từ|tính từ|trạng từ|phó từ|giới từ|đại từ|liên từ|thán từ|mạo từ|số từ|cụm từ|dạng từ)/i;
 fragment.children().each((_,element)=>{
  const current=$(element);const heading=current.is('h3,h4,h5')?current:current.children('h3,h4,h5').first();
  if(heading.length){const label=text(heading.text(),100);partOfSpeech=parts.test(label)?label:'';return;}
  if(!partOfSpeech||!current.is('ol'))return;
  const definitions:DictionaryDefinition[]=[];
  current.children('li').slice(0,12).each((_,li)=>{const gloss=$(li).clone();const example=text(gloss.find('dd').first().text(),1000);gloss.find('dl,ol,ul,table').remove();const definition=text(gloss.text());if(definition)definitions.push({definition,...(example?{example}:{}),source:'Wiktionary tiếng Việt',license:CC});});
  if(definitions.length)meanings.push({partOfSpeech,definitions});
 });
 const phonetic=text(fragment.find('.IPA').first().text(),150);
 const audio=safeAudio(fragment.find('audio source').first().attr('src')||fragment.find('audio').first().attr('src'),'https://vi.wiktionary.org',['upload.wikimedia.org']);
 const canonical=text(data.parse.title,100)||word;
 const attributions:DictionaryEntry['attributions']=[{name:'Wiktionary tiếng Việt và các tác giả',url:wikiUrl(canonical),license:CC}];
 // Audio files have per-file licenses on Wikimedia Commons; retain their attribution link.
 if(audio)attributions.push({name:'Wikimedia Commons — giấy phép âm thanh theo tệp',url:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(fragment.find('audio').first().attr('data-mwtitle')||'' )});
 return entry(word,canonical,meanings,{language:'vi',source:'Wiktionary tiếng Việt',sourceUrl:wikiUrl(canonical),license:CC,attributions},phonetic,audio);
}
export function parseEnglish(value:unknown,word:string):DictionaryEntry|null{
 if(!Array.isArray(value))return null;const rows=value.filter(row=>row&&typeof row.word==='string'&&Array.isArray(row.meanings));if(!rows.length)return null;
 const meanings:DictionaryMeaning[]=[];for(const row of rows.slice(0,4))for(const meaning of row.meanings.slice(0,8)){
  if(!Array.isArray(meaning?.definitions))continue;const definitions:DictionaryDefinition[]=meaning.definitions.slice(0,12).map((d:any)=>({definition:text(d?.definition),...(text(d?.example,1000)?{example:text(d.example,1000)}:{}),source:'Free Dictionary API'})).filter((d:DictionaryDefinition)=>d.definition);
  if(definitions.length)meanings.push({partOfSpeech:text(meaning.partOfSpeech,100)||'other',definitions});
 }
 const first=rows[0];const phonetics=Array.isArray(first.phonetics)?first.phonetics:[];const phonetic=text(first.phonetic||phonetics.find((p:any)=>typeof p?.text==='string')?.text,150);
 const audio=safeAudio(phonetics.find((p:any)=>p?.audio)?.audio,'https://api.dictionaryapi.dev',['api.dictionaryapi.dev','upload.wikimedia.org']);
 const license=text(first.license?.name,100)||'Xem giấy phép tại nguồn';const sourceUrl=typeof first.sourceUrls?.[0]==='string'&&/^https:\/\/en\.wiktionary\.org\//.test(first.sourceUrls[0])?first.sourceUrls[0]:`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
 return entry(word,text(first.word,100),meanings,{language:'en',source:'Free Dictionary API (Anh–Anh)',sourceUrl,license,attributions:[{name:'Free Dictionary API',url:'https://dictionaryapi.dev/'},{name:'Wiktionary — nguồn mục từ',url:sourceUrl,license}]},phonetic,audio);
}

export type JsonFetcher=(url:string,timeout:number)=>Promise<unknown>;
export class ProviderHttpError extends Error {constructor(public status:number){super('Dictionary provider request failed');}}
export const fetchProviderJson:JsonFetcher=async(url,timeout)=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(timeout),redirect:'error',headers:{'User-Agent':'LingoPress/1.0 (English-Vietnamese reading dictionary)','Accept':'application/json'}});
 if(!response.ok)throw new ProviderHttpError(response.status);
 if(Number(response.headers.get('content-length'))>2_000_000)throw new Error('Dictionary response too large');
 const reader=response.body?.getReader();if(!reader)throw new Error('Empty dictionary response');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error('Dictionary response too large');}chunks.push(next.value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};
export async function primaryLookup(word:string,fetchJson:JsonFetcher){
 const url=`${PRIMARY}/api/v1/lookup?${new URLSearchParams({word,lang:'en',def_lang:'vi'})}`;
 for(let attempt=0;attempt<2;attempt++)try{const value=await fetchJson(url,3000) as any;if(value?.exists===false)return null;if(value?.exists!==true||!Array.isArray(value.results))throw new Error('Invalid primary dictionary response');return parsePrimary(value,word);}catch(error){if(attempt||error instanceof ProviderHttpError&&error.status<500)throw error;}
 return null;
}
export async function wiktionaryLookup(word:string,fetchJson:JsonFetcher){const value=await fetchJson(`https://vi.wiktionary.org/w/api.php?${new URLSearchParams({action:'parse',page:word,prop:'text',format:'json',formatversion:'2',redirects:'1',disableeditsection:'1'})}`,4000) as any;if(value?.error?.code==='missingtitle')return null;if(typeof value?.parse?.text!=='string')throw new Error('Invalid Wiktionary response');return parseWiktionary(value,word);}
export async function englishLookup(word:string,fetchJson:JsonFetcher){const value=await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,3500);if(!Array.isArray(value))throw new Error('Invalid English dictionary response');return parseEnglish(value,word);}

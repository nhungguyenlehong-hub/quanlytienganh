import {MysqlDictionaryCache} from './repository.js';
import {primaryLookup,wiktionaryLookup,englishLookup,fetchProviderJson,ProviderHttpError,type JsonFetcher} from './providers.js';
import {DictionaryError,type DictionaryCache,type DictionaryEntry} from './types.js';
export const VI_TTL=30*86400000;
export const EN_TTL=3600000;
export const NEGATIVE_TTL=120000;
export function normalizeWord(value:unknown){
 if(typeof value!=='string'||value.length>200)throw new DictionaryError(400,'Chọn một từ hoặc cụm từ tiếng Anh để tra.');
 const word=value.normalize('NFKC').replace(/[’‘ʼ]/g,"'").replace(/[‐‑–—]/g,'-').trim()
  .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,'').replace(/\s+/g,' ').toLowerCase();
 if(!word||word.length>80||!/^\p{Script=Latin}+(?:[' -]\p{Script=Latin}+)*$/u.test(word))throw new DictionaryError(400,'Chọn một từ hoặc cụm từ tiếng Anh để tra.');
 return word;
}
type MemoryValue={entry:DictionaryEntry|null;expiresAt:number};
export class DictionaryService {
 private memory=new Map<string,MemoryValue>();
 private inflight=new Map<string,Promise<DictionaryEntry>>();
 constructor(private fetchJson:JsonFetcher=fetchProviderJson,private cache:DictionaryCache=new MysqlDictionaryCache(),private now:()=>number=Date.now,private limit=1000){}
 private remember(word:string,value:MemoryValue){this.memory.delete(word);this.memory.set(word,value);while(this.memory.size>this.limit)this.memory.delete(this.memory.keys().next().value!);}
 async lookup(value:unknown):Promise<DictionaryEntry>{
  const word=normalizeWord(value);const cached=this.memory.get(word);
  if(cached&&cached.expiresAt>this.now()){this.remember(word,cached);if(!cached.entry)throw new DictionaryError(404,'Không tìm thấy từ này trong từ điển.');return structuredClone(cached.entry);}
  if(cached)this.memory.delete(word);
  const pending=this.inflight.get(word);if(pending)return structuredClone(await pending);
  const task=this.load(word);this.inflight.set(word,task);
  try{return structuredClone(await task);}finally{this.inflight.delete(word);}
 }
 private async load(word:string):Promise<DictionaryEntry>{
  let disk:MemoryValue|null=null;try{disk=await this.cache.get(word);}catch{/* Cache is optional for dictionary lookup. */}
  if(disk&&disk.expiresAt>this.now()){
   this.remember(word,disk);if(!disk.entry)throw new DictionaryError(404,'Không tìm thấy từ này trong từ điển.');return disk.entry;
  }
  let unavailable=false;
  for(const provider of [primaryLookup,wiktionaryLookup,englishLookup]){
   try{const result=await provider(word,this.fetchJson);if(!result)continue;
    const ttl=result.language==='vi'?VI_TTL:EN_TTL;this.remember(word,{entry:result,expiresAt:this.now()+ttl});await this.cache.set(word,result,ttl).catch(()=>{});return result;
   }catch(error){if(!(error instanceof ProviderHttpError&&error.status===404))unavailable=true;}
  }
  if(unavailable)throw new DictionaryError(502,'Nguồn từ điển đang tạm gián đoạn. Vui lòng thử lại.');
  this.remember(word,{entry:null,expiresAt:this.now()+NEGATIVE_TTL});await this.cache.set(word,null,NEGATIVE_TTL).catch(()=>{});
  throw new DictionaryError(404,'Không tìm thấy từ này trong từ điển.');
 }
}
const dictionary=new DictionaryService();
export const lookupWord=(word:unknown)=>dictionary.lookup(word);

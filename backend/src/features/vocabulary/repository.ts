import {randomUUID} from 'node:crypto';
import {readStore,writeStore} from '../../shared/db/store.js';
export type Word={id:string;userId:string;word:string;meaning:string;context:string;articleId:string;createdAt:string;known:boolean;knownAt?:string};
export type SaveWordInput=Pick<Word,'word'|'meaning'|'context'|'articleId'>;
let words:Word[]=[];
export async function initializeVocabulary(){
 const stored=await readStore<Array<Omit<Word,'known'>&{known?:boolean}>>('words',[]);
 words=stored.map(value=>{const {knownAt,...rest}=value;const known=value.known===true;return {...rest,known,...(known&&typeof knownAt==='string'?{knownAt}:{})};});
}
export function listWords(userId:string){return words.filter(word=>word.userId===userId);}
export async function saveWord(userId:string,input:SaveWordInput){
 // Only learning content may be changed through save/resave. State has its own action.
 const value:SaveWordInput={word:input.word,meaning:input.meaning,context:input.context,articleId:input.articleId};
 const existing=words.find(word=>word.userId===userId&&word.word.toLowerCase()===value.word.toLowerCase()&&word.articleId===value.articleId);
 if(existing){Object.assign(existing,value);await writeStore('words',words);return existing;}
 const entry:Word={...value,id:randomUUID(),userId,createdAt:new Date().toISOString(),known:false};words.unshift(entry);await writeStore('words',words);return entry;
}
export async function setWordKnown(userId:string,id:string,known:boolean):Promise<Word|null>{
 if(typeof known!=='boolean')throw Object.assign(new Error('known phải là boolean.'),{status:400});
 const word=words.find(value=>value.id===id&&value.userId===userId);if(!word)return null;
 word.known=known;if(known){word.knownAt=word.knownAt||new Date().toISOString();}else{delete word.knownAt;}
 await writeStore('words',words);return word;
}
export async function removeWord(userId:string,id:string){words=words.filter(word=>word.id!==id||word.userId!==userId);await writeStore('words',words);}

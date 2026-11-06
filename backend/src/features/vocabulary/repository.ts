import {randomUUID} from 'node:crypto';
import {readStore,writeStore} from '../../shared/db/store.js';
export type Word={id:string;userId:string;word:string;meaning:string;context:string;articleId:string;createdAt:string};
let words:Word[]=[];
export async function initializeVocabulary(){words=await readStore('words',[]);}
export function listWords(userId:string){return words.filter(word=>word.userId===userId);}
export async function saveWord(userId:string,value:Omit<Word,'id'|'userId'|'createdAt'>){
 const existing=words.find(word=>word.userId===userId&&word.word.toLowerCase()===value.word.toLowerCase()&&word.articleId===value.articleId);if(existing)return existing;
 const entry={...value,id:randomUUID(),userId,createdAt:new Date().toISOString()};words.unshift(entry);await writeStore('words',words);return entry;
}
export async function removeWord(userId:string,id:string){words=words.filter(word=>word.id!==id||word.userId!==userId);await writeStore('words',words);}

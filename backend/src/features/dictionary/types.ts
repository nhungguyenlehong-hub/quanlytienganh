export interface DictionaryDefinition {definition:string;example?:string;source?:string;license?:string}
export interface DictionaryMeaning {partOfSpeech:string;definitions:DictionaryDefinition[]}
export interface DictionaryEntry {
 word:string;headword?:string;phonetic:string;audio:string;meaning:string;definition:string;partOfSpeech:string;
 meanings:DictionaryMeaning[];language:'vi'|'en';source:string;sourceUrl:string;license:string;
 attributions:{name:string;url:string;license?:string}[];
}
export interface DictionaryCache {
 get(word:string):Promise<{entry:DictionaryEntry|null;expiresAt:number}|null>;
 set(word:string,entry:DictionaryEntry|null,ttl:number):Promise<void>;
}
export class DictionaryError extends Error {constructor(public status:number,message:string){super(message);}}

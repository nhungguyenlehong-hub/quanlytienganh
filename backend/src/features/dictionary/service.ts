export async function lookupWord(word:string){
 const response=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Object.assign(new Error('Không tìm thấy từ này trong từ điển.'),{status:404});
 const entries=await response.json() as any[];const e=entries[0];const meaning=e.meanings?.[0];const definition=meaning?.definitions?.[0]?.definition||'';
 return {word:e.word,phonetic:e.phonetic||e.phonetics?.find((p:any)=>p.text)?.text||'',audio:e.phonetics?.find((p:any)=>p.audio)?.audio||'',meaning:definition,definition,partOfSpeech:meaning?.partOfSpeech,meanings:e.meanings,entries,source:'Free Dictionary API',language:'en'};
}

import {Router} from 'express';
import {lookupWord} from './service.js';
export const dictionaryRouter=Router();
dictionaryRouter.get('/',async(req,res)=>{
 const word=typeof req.query.word==='string'?req.query.word.trim():'';if(!/^[a-zA-Z][a-zA-Z '-]{0,79}$/.test(word)){res.status(400).json({error:'Enter an English word or phrase'});return;}
 try{res.json(await lookupWord(word));}catch(error){const notFound=(error as {status?:number}).status===404;res.status(notFound?404:502).json({error:notFound?'Không tìm thấy từ này trong từ điển.':'Dictionary temporarily unavailable',word});}
});

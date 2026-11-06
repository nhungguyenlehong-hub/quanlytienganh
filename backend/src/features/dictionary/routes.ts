import {Router} from 'express';
import {lookupWord} from './service.js';
import {DictionaryError} from './types.js';
export const dictionaryRouter=Router();
dictionaryRouter.get('/',async(req,res)=>{
 try{res.json(await lookupWord(req.query.word));}catch(error){res.status(error instanceof DictionaryError?error.status:502).json({error:error instanceof DictionaryError?error.message:'Nguồn từ điển đang tạm gián đoạn. Vui lòng thử lại.'});}
});

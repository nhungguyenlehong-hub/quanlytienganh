import {Router,type RequestHandler} from 'express';
import {requireAuth} from '../auth/routes.js';
import {listWords,saveWord,removeWord,setWordKnown} from './repository.js';
export function createVocabularyRouter(authenticate:RequestHandler=requireAuth){
const vocabularyRouter=Router();vocabularyRouter.use(authenticate);
vocabularyRouter.get('/',(_req,res)=>res.json({words:listWords(res.locals.user.id)}));
vocabularyRouter.post('/',async(req,res)=>{
 const {word,meaning='',context='',articleId=''}=req.body||{};if(typeof word!=='string'||!word.trim()||word.length>100||[meaning,context,articleId].some(x=>typeof x!=='string')||meaning.length>4000||context.length>8000){res.status(400).json({error:'Invalid word'});return;}
 const entry=await saveWord(res.locals.user.id,{word:word.trim(),meaning,context,articleId});res.status(201).json({word:entry});
});
vocabularyRouter.delete('/:id',async(req,res)=>{await removeWord(res.locals.user.id,String(req.params.id));res.json({ok:true});});
vocabularyRouter.patch('/:id',async(req,res)=>{
 if(!req.body||typeof req.body.known!=='boolean'){res.status(400).json({error:'known phải là boolean (true hoặc false).'});return;}
 const word=await setWordKnown(res.locals.user.id,String(req.params.id),req.body.known);
 if(!word){res.status(404).json({error:'Không tìm thấy từ đã lưu.'});return;}
 res.json({word});
});
return vocabularyRouter;
}
export const vocabularyRouter=createVocabularyRouter();

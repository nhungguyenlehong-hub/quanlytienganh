import {Router} from 'express';
import {requireAuth} from '../auth/routes.js';
import {listWords,saveWord,removeWord} from './repository.js';
export const vocabularyRouter=Router();vocabularyRouter.use(requireAuth);
vocabularyRouter.get('/',(_req,res)=>res.json({words:listWords(res.locals.user.id)}));
vocabularyRouter.post('/',async(req,res)=>{
 const {word,meaning='',context='',articleId=''}=req.body||{};if(typeof word!=='string'||!word.trim()||word.length>100||[meaning,context,articleId].some(x=>typeof x!=='string')||meaning.length>4000||context.length>8000){res.status(400).json({error:'Invalid word'});return;}
 const entry=await saveWord(res.locals.user.id,{word:word.trim(),meaning,context,articleId});res.status(201).json({word:entry});
});
vocabularyRouter.delete('/:id',async(req,res)=>{await removeWord(res.locals.user.id,String(req.params.id));res.json({ok:true});});

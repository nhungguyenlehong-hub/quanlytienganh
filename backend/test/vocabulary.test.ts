import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import express from 'express';
import type {AddressInfo} from 'node:net';

test('saved vocabulary migration, learning state and owned HTTP actions persist safely',async(t)=>{
 const directory=await mkdtemp(path.join(tmpdir(),'lingopress-vocabulary-'));
 process.env.DATA_DIR=directory;
 const {saveWord,listWords,initializeVocabulary,setWordKnown,removeWord}=await import('../src/features/vocabulary/repository.js');
 try{
  await writeFile(path.join(directory,'words.json'),JSON.stringify([{id:'legacy-word',userId:'legacy-learner',word:'read',meaning:'Đọc.',context:'Read daily.',articleId:'expired-article',createdAt:'2025-01-01T00:00:00.000Z'}]));
  await initializeVocabulary();
  await t.test('older records default to unknown without losing their saved context',()=>{
   const legacy=listWords('legacy-learner')[0];assert.equal(legacy.known,false);assert.equal(legacy.knownAt,undefined);assert.equal(legacy.context,'Read daily.');assert.equal(legacy.articleId,'expired-article');
  });
  const initial=await saveWord('learner-a',{word:'book',meaning:'Sách.',context:'Read a book.',articleId:'article-one'});
  const other=await saveWord('learner-b',{word:'book',meaning:'Cuốn sách.',context:'Another context.',articleId:'article-one'});
  await t.test('new saves start unknown',()=>{assert.equal(initial.known,false);assert.equal(initial.knownAt,undefined);});
  let learnedAt='';
  await t.test('known status and its timestamp survive persistence and reinitialization',async()=>{
   const learned=await setWordKnown('learner-a',initial.id,true);assert(learned);assert.equal(learned.known,true);assert(Number.isFinite(Date.parse(learned.knownAt!)));learnedAt=learned.knownAt!;
   await initializeVocabulary();assert.equal(listWords('learner-a')[0].known,true);assert.equal(listWords('learner-a')[0].knownAt,learnedAt);
  });
  const updated=await saveWord('learner-a',{word:'book',meaning:'Đặt chỗ.',context:'Book a room.',articleId:'article-one'});
  assert.equal(updated.id,initial.id);
  assert.equal(listWords('learner-a').length,1);
  assert.equal(listWords('learner-a')[0].meaning,'Đặt chỗ.');
  assert.equal(listWords('learner-b')[0].meaning,'Cuốn sách.');
  await t.test('resaving a selected meaning preserves identity, creation date and learning status',()=>{
   assert.equal(updated.known,true);assert.equal(updated.knownAt,learnedAt);assert.equal(updated.createdAt,initial.createdAt);
  });
  const persisted=JSON.parse(await readFile(path.join(directory,'words.json'),'utf8'));
  assert.equal(persisted.find((word:{userId:string})=>word.userId==='learner-a').context,'Book a room.');
  await t.test('another learner cannot update or delete an owned word',async()=>{
   assert.equal(await setWordKnown('learner-b',initial.id,false),null);await removeWord('learner-b',initial.id);assert.equal(listWords('learner-a')[0].known,true);assert.equal(listWords('learner-b')[0].id,other.id);
  });
  const {createVocabularyRouter}=await import('../src/features/vocabulary/routes.js');
  const app=express();app.use(express.json());
  app.use('/api/words',createVocabularyRouter((req,res,next)=>{const id=req.header('x-test-learner');if(!id){res.status(401).json({error:'Authentication required'});return;}res.locals.user={id};next();}));
  app.use('/protected',createVocabularyRouter());
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error.status||500).json({error:'Invalid request'});});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const patch=(id:string,body:unknown,learner='learner-a')=>fetch(`${base}/api/words/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json','x-test-learner':learner},body:JSON.stringify(body)});
  try{
   await t.test('PATCH rejects missing and nonboolean status without changing the saved word',async()=>{
    for(const value of [{},{known:'false'},{known:0},{known:null},{known:[]},null])assert.equal((await patch(initial.id,value)).status,400);
    assert.equal(listWords('learner-a')[0].known,true);
   });
   await t.test('PATCH does not reveal another learner word and requires authentication',async()=>{
    const denied=await patch(other.id,{known:true});const missing=await patch('missing-word',{known:true});assert.equal(denied.status,404);assert.equal(missing.status,404);assert.deepEqual(await denied.json(),await missing.json());
    assert.equal((await fetch(`${base}/protected/${initial.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"known":false}'})).status,401);
   });
   await t.test('PATCH unknown removes knownAt, then known is persisted again',async()=>{
    const response=await patch(initial.id,{known:false});assert.equal(response.status,200);const data=await response.json() as any;assert.equal(data.word.known,false);assert.equal(data.word.knownAt,undefined);
    await initializeVocabulary();assert.equal(listWords('learner-a')[0].known,false);assert.equal(listWords('learner-a')[0].knownAt,undefined);
    assert.equal((await patch(initial.id,{known:true})).status,200);await initializeVocabulary();assert.equal(listWords('learner-a')[0].known,true);
   });
   await t.test('DELETE is idempotent and scoped to the authenticated owner',async()=>{
    const headers={'x-test-learner':'learner-a'};assert.equal((await fetch(`${base}/api/words/${other.id}`,{method:'DELETE',headers})).status,200);assert.equal(listWords('learner-b').length,1);
    for(let i=0;i<2;i++)assert.equal((await fetch(`${base}/api/words/${initial.id}`,{method:'DELETE',headers})).status,200);
    await initializeVocabulary();assert.equal(listWords('learner-a').length,0);assert.equal(listWords('learner-b').length,1);assert.equal(listWords('legacy-learner')[0].context,'Read daily.');
   });
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 }finally{
  // Only remove this test's freshly created, explicitly verified temporary directory.
  if(path.dirname(directory)!==path.resolve(tmpdir())||!path.basename(directory).startsWith('lingopress-vocabulary-'))throw new Error('Unexpected test directory');
  await rm(directory,{recursive:true,force:true});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, verifyTranslations, TranslationService, validateSentences, type TranslationRepository, type StoredTranslation } from './translation.js';
import { AiError, aiConfig, type AiProvider, type JsonGenerationRequest } from './provider.js';

function memoryRepository() {
  const records = new Map<string, StoredTranslation>();
  const repository: TranslationRepository = {
    get: async (id, key) => records.get(`${id}:${key}`) || null,
    save: async ({articleId,cacheKey,input,output,model}) => { records.set(`${articleId}:${cacheKey}`, { input: [...input], output: [...output], model }); },
  };
  return { repository, records };
}
const makeProvider = (generate: (request: JsonGenerationRequest) => Promise<unknown>) => ({ json: generate }) as unknown as AiProvider;

test('sentence splitting preserves paragraphs and complete text including abbreviations', () => {
  const paragraphs = ['Dr. Smith arrived at 3.30 p.m. He stayed.', 'A second paragraph without punctuation'];
  const sentences = splitSentences(paragraphs);
  assert.equal(sentences.map(s => s.text).join('').replace(/\s/g, ''), paragraphs.join('').replace(/\s/g, ''));
  assert.equal(sentences.at(-1)?.paragraphIndex, 1);
  assert.equal(new Set(sentences.map(s => s.id)).size, sentences.length);
});

test('root translation array rejects missing, extra, nonstring and empty translations', () => {
  const source = [{ id: 'a', text: 'Hello.' }, { id: 'b', text: 'Goodbye.' }];
  for (const invalid of [['Xin chào.'], ['A','B','C'], ['A',null], ['A',''], {translations:['A','B']}])
    assert.throws(() => verifyTranslations(source, invalid));
  assert.deepEqual(verifyTranslations(source, ['Xin chào.', 'Tạm biệt.']), [
    {...source[0],translation:'Xin chào.'}, {...source[1],translation:'Tạm biệt.'},
  ]);
  assert.throws(() => validateSentences([{ id: 'a', text: 'one' }, { id: 'a', text: 'two' }]));
});

test('whole article with 95 sentences makes exactly one request, saves root source/output arrays in repository', async () => {
  const {repository,records} = memoryRepository();
  const input = Array.from({length:95},(_,i)=>({id:`p${i}-s0`,text:`Article sentence ${i}.`,paragraphIndex:i}));
  let calls = 0;
  const provider = makeProvider(async request => {
    calls++;
    assert.deepEqual(JSON.parse(request.prompt), input.map(s=>s.text));
    assert.equal(request.retry,false);
    assert.equal(request.model,aiConfig().models.translation);
    assert.equal(request.maxOutputTokens,65536);
    assert.equal((request.schema as {type:string}).type,'array');
    const pending = [...records.values()][0];
    assert.deepEqual(pending.input,input.map(s=>s.text));
    assert.deepEqual(pending.output,[]);
    await new Promise(resolve=>setTimeout(resolve,10));
    return input.map((_,i)=>`Câu dịch ${i}.`);
  });
  const service = new TranslationService(provider,repository);
  const [first,concurrent] = await Promise.all([service.translate('article-a',input),service.translate('article-a',input)]);
  assert.equal(calls,1);
  assert.equal(first.translations.length,95);
  assert.deepEqual(concurrent.translations,first.translations);
  assert.equal(first.translations[94].id,'p94-s0');
  assert.equal(first.translations[94].translation,'Câu dịch 94.');
  assert.deepEqual([...records.values()][0].output,input.map((_,i)=>`Câu dịch ${i}.`));
  const cached = await service.translate('article-a',input);
  assert.equal(cached.cached,true);
  assert.equal(calls,1);
});

test('translation retries three times after initial failure, then reports failure without a completed cache', async () => {
  const {repository,records} = memoryRepository(); let calls=0;
  const delays:number[]=[];
  const service = new TranslationService(makeProvider(async () => {calls++;throw Object.assign(new Error('quota'),{status:429});}),repository,async ms=>{delays.push(ms);});
  await assert.rejects(service.translate('failed',[{id:'a',text:'Hello.'}]),/3 lần thử lại/);
  assert.equal(calls,4);
  assert.deepEqual(delays,[1000,2000,4000]);
  assert.deepEqual([...records.values()][0].output,[]);
});

test('database lookup and write failures propagate without any upstream request', async () => {
  let calls=0;
  const provider=makeProvider(async()=>{calls++;return ['Xin chào.'];});
  const dbError=new Error('database unavailable');
  const readFailure:TranslationRepository={get:async()=>{throw dbError;},save:async()=>{}};
  await assert.rejects(new TranslationService(provider,readFailure).translate('a',[{id:'a',text:'Hello.'}]),dbError);
  const writeFailure:TranslationRepository={get:async()=>null,save:async()=>{throw dbError;}};
  await assert.rejects(new TranslationService(provider,writeFailure).translate('a',[{id:'a',text:'Hello.'}]),dbError);
  assert.equal(calls,0);
});

test('invalid output retries the full article, then caches only valid output; content change invalidates cache', async () => {
  const {repository,records}=memoryRepository(); let calls=0;
  const provider=makeProvider(async request=>{calls++;return calls===1?[]:(JSON.parse(request.prompt) as string[]).map(()=> 'Bản dịch.');});
  const service=new TranslationService(provider,repository,async()=>{});
  const result=await service.translate('a',[{id:'a',text:'Hello.'}]);
  assert.equal(result.sentences[0].translation,'Bản dịch.');
  assert.deepEqual([...records.values()][0].output,['Bản dịch.']);
  await service.translate('a',[{id:'a',text:'Changed source.'}]);
  assert.equal(calls,3);
  assert.equal(records.size,2);
});

test('temporary failures recover on the last retry and concurrent readers share all attempts',async()=>{
  const {repository}=memoryRepository();let calls=0;
  const service=new TranslationService(makeProvider(async()=>{
    calls++;if(calls<4)throw Object.assign(new Error('unavailable'),{status:503});
    return ['Xin chào.'];
  }),repository,async()=>{});
  const input=[{id:'a',text:'Hello.'}];
  const results=await Promise.all([service.translate('a',input),service.translate('a',input)]);
  assert.equal(calls,4);assert.deepEqual(results[0],results[1]);
  assert.equal((await service.translate('a',input)).cached,true);assert.equal(calls,4);
});

test('missing API key or invalid credentials fail immediately without retries',async()=>{
  for(const error of [new AiError(503,'Chưa cấu hình Gemini.'),Object.assign(new Error('invalid key'),{status:403})]){
    const {repository}=memoryRepository();let calls=0;
    const service=new TranslationService(makeProvider(async()=>{calls++;throw error;}),repository,async()=>{throw new Error('should not wait');});
    await assert.rejects(service.translate('a',[{id:'a',text:'Hello.'}]),error);assert.equal(calls,1);
  }
});

test('failed database save after AI success does not regenerate translation',async()=>{
  let calls=0;let writes=0;
  const repository:TranslationRepository={get:async()=>null,save:async()=>{if(++writes>1)throw new Error('database write failed');}};
  const service=new TranslationService(makeProvider(async()=>{calls++;return ['Xin chào.'];}),repository,async()=>{});
  await assert.rejects(service.translate('a',[{id:'a',text:'Hello.'}]),/database write failed/);
  assert.equal(calls,1);assert.equal(writes,2);
});

test('malformed database cache is rejected without paying to regenerate', async () => {
  let calls=0;
  const repository:TranslationRepository={get:async()=>({input:['Hello.'],output:['A','B'],model:aiConfig().models.translation}),save:async()=>{throw new Error('should not write');}};
  const service=new TranslationService(makeProvider(async()=>{calls++;return ['Xin chào.'];}),repository);
  await assert.rejects(service.translate('a',[{id:'a',text:'Hello.'}]));
  assert.equal(calls,0);
});

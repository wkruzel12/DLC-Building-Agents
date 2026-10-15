const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {caseSchema,MAX_CASE_ITEMS}=require('../src/lib/case-schema.ts');
const {publicScenario}=require('../src/lib/scenario.ts');
const {saveCase,readCase,CASE_TTL_MS}=require('../src/lib/case-store.ts');
const {readPrivateCase}=require('../src/lib/private-cases.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));

test('validates required case fields and normalizes optional metadata',()=>{
 const {characters,rubric,skill_tags,...minimal}=sample;
 const parsed=caseSchema.parse(minimal);
 assert.deepEqual(parsed.skill_tags,[]);assert.deepEqual(parsed.rubric,{});
 for(const field of ['id','title','story','task','requirements','items','answer_key','decisions']){const invalid={...sample};delete invalid[field];assert.equal(caseSchema.safeParse(invalid).success,false,field);}
});

test('rejects duplicate, incomplete, excessive, and inconsistent grading records',()=>{
 for(const invalid of [
  {...sample,items:[]},
  {...sample,items:[sample.items[0],sample.items[0]]},
  {...sample,items:Array.from({length:MAX_CASE_ITEMS+1},()=>sample.items[0])},
  {...sample,answer_key:sample.answer_key.slice(1)},
  {...sample,answer_key:[...sample.answer_key,sample.answer_key[0]]},
  {...sample,decisions:['advance']},
  {...sample,decisions:['invented']}
 ])assert.equal(caseSchema.safeParse(invalid).success,false);
});

test('public serialization never includes grading keys or arbitrary private metadata',()=>{
 const value=publicScenario({...sample,rubric:{answer_key:'PRIVATE_MARKER'},characters:[{note:'PRIVATE_MARKER'}],answer_key:sample.answer_key.map(item=>({...item,note:'PRIVATE_MARKER'}))});
 assert.equal(value.answer_key,undefined);assert.equal(value.rubric,undefined);assert.equal(value.characters,undefined);
 assert.ok(!JSON.stringify(value).includes('PRIVATE_MARKER'));
 assert.equal(value.items[0].text,sample.items[0].text);
});

test('temporary cases enforce ownership, expiration, cleanup, and production exclusion',async t=>{
 const previous=process.env.NODE_ENV,now=Date.now;
 t.after(()=>{process.env.NODE_ENV=previous;Date.now=now;});
 process.env.NODE_ENV='development';
 const stored=await saveCase('owner-a',sample);
 try{
  assert.equal(await readCase(stored.id,'owner-b'),null);
  assert.equal((await readCase(stored.id,'owner-a')).title,sample.title);
  assert.equal(await readCase('../../secrets','owner-a'),null);
  process.env.NODE_ENV='production';
  await assert.rejects(readCase(stored.id,'owner-a'),/only in development/);
 }finally{process.env.NODE_ENV='development';Date.now=()=>now()+CASE_TTL_MS+1;assert.equal(await readCase(stored.id,'owner-a'),null);}
});

test('durable private case reads include the authenticated ownership filter',async t=>{
 const oldFetch=global.fetch,oldEnv={...process.env};
 t.after(()=>{global.fetch=oldFetch;process.env=oldEnv;});
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
 global.fetch=async url=>{
  const request=new URL(url);
  assert.equal(request.searchParams.get('owner_id'),'eq.current-user');
  assert.equal(request.searchParams.get('id'),'eq.12345678-1234-4123-8123-123456789012');
  return new Response(JSON.stringify([{scenario:sample}]),{headers:{'Content-Type':'application/json'}});
 };
 assert.equal((await readPrivateCase('12345678-1234-4123-8123-123456789012','current-user')).title,sample.title);
});

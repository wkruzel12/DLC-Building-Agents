const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {runStage}=require('../src/lib/runner.ts');
const {performStageTest,stageTestInput}=require('../src/lib/stage-test-service.ts');
const {freshProgress,currentTest,restoreProgress}=require('../src/lib/builder-progress.ts');
const {localWorkspace}=require('../src/lib/stakeholder-local.ts');
const steps={extract:'Identify relevant evidence.',check:'Compare evidence with requirements.',flag:'Choose the supported case action.'};
const scenario={id:'merge-case',title:'Document review',story:'Review duplicate documents.',task:'Identify duplicates.',requirements:'Compare source evidence.',decisions:['retain','merge'],items:[{id:'A-10',label:'Document 10',text:'Document with source evidence.'},{id:'A-02',label:'Document 2',text:'Matching source evidence.'}],answer_key:[{item_id:'A-10',decision:{type:'merge',target_record_id:'A-02'},planted:true,note:'PRIVATE_GRADING_NOTE'}],characters:[],rubric:{private:'PRIVATE_RUBRIC'},skill_tags:[]};
const response=text=>new Response(JSON.stringify({id:'stage-response',status:'completed',output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]}),{headers:{'Content-Type':'application/json'}});
function configure(t,fetch){const env={...process.env},old=global.fetch;process.env.NODE_ENV='development';process.env.DEMO_MODE='true';process.env.OPENAI_API_KEY='test-stage-key';global.fetch=fetch;t.after(()=>{process.env=env;global.fetch=old;});}
function access(t){const value={local:true,owner:randomUUID()};t.after(async()=>{process.env.NODE_ENV='development';await localWorkspace(value.owner,w=>{w.expiresAt=0;});});return value;}
const input=(stage,upstream={},overrides={})=>stageTestInput.parse({case_id:'case-id',record_id:'A-10',stage,steps,upstream,request_id:randomUUID(),...overrides});
function model(calls){return async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);assert.equal(body.store,false);assert.ok(body.max_output_tokens<=650);assert.ok(!options.body.includes('PRIVATE_GRADING_NOTE'));assert.ok(!options.body.includes('PRIVATE_RUBRIC'));return response(body.instructions.includes('stage 3')?JSON.stringify({decision:{type:'merge',target_record_id:'A-02'},reason:'Source evidence supports merging.'}):body.instructions.includes('stage 2')?'ACTUAL_CHECK_OUTPUT':'ACTUAL_EXTRACT_OUTPUT');};}

test('isolated tests make exactly one real-model request per stage even in demo mode, without scoring or hidden keys',async t=>{
 const calls=[];configure(t,model(calls));const owner=access(t);
 const extract=await performStageTest(owner,scenario,input('extract'));
 const check=await performStageTest(owner,scenario,input('check',{extract:extract.receipt}));
 const flag=await performStageTest(owner,scenario,input('flag',{extract:extract.receipt,check:check.receipt}));
 assert.equal(calls.length,3);assert.match(calls[1].input,/ACTUAL_EXTRACT_OUTPUT/);assert.match(calls[1].input,/A-10/);assert.match(calls[1].input,/A-02/);assert.equal(calls[2].input,'CHECK OUTPUT:\nACTUAL_CHECK_OUTPUT');
 assert.deepEqual(flag.decision,{type:'merge',target_record_id:'A-02'});assert.equal(flag.record_id,'A-10');assert.deepEqual(flag.upstream_ids,[extract.id,check.id]);
 for(const value of [extract,check,flag]){for(const key of ['accuracy','expected_decision','answer_key','match','planted_caught','owner_tag'])assert.equal(value[key],undefined);assert.ok(!JSON.stringify(value).includes(owner.owner));}
 const workspace=await localWorkspace(owner.owner,w=>w);assert.equal(workspace.attempts.length,0);assert.equal(workspace.reservations.length,3);
});
test('server verifies prior successes, exact record IDs, ownership, case content, unchanged instructions, and the output chain',async t=>{
 const calls=[];configure(t,model(calls));const owner=access(t),other=access(t);
 await assert.rejects(performStageTest(owner,scenario,input('check')),e=>e.status===409);
 const extract=await performStageTest(owner,scenario,input('extract'));
 const check=await performStageTest(owner,scenario,input('check',{extract:extract.receipt}));
 for(const [who,selected,request]of [
  [other,scenario,input('check',{extract:extract.receipt})],
  [owner,scenario,input('check',{extract:extract.receipt+'bad'})],
  [owner,scenario,input('check',{extract:extract.receipt},{record_id:'A-02'})],
  [owner,{...scenario,requirements:'Changed requirements'},input('check',{extract:extract.receipt})],
  [owner,scenario,input('check',{extract:extract.receipt},{steps:{...steps,extract:'Different instructions now.'}})],
  [owner,scenario,input('check',{extract:extract.receipt},{case_id:'other-case'})],
 ])await assert.rejects(performStageTest(who,selected,request),e=>e.status===409);
 await assert.rejects(performStageTest(owner,scenario,input('extract',{}, {record_id:'a-10'})),e=>e.status===400);
 const newer=await performStageTest(owner,scenario,input('extract'));
 await assert.rejects(performStageTest(owner,scenario,input('flag',{extract:newer.receipt,check:check.receipt})),e=>e.status===409);
 assert.equal(calls.length,3);
});
test('duplicate in-flight requests reuse one model execution and changed requests cannot reuse the ID',async t=>{
 const calls=[];configure(t,model(calls));const owner=access(t),request=input('extract');
 const [a,b]=await Promise.all([performStageTest(owner,scenario,request),performStageTest(owner,scenario,request)]);
 assert.equal(a.id,b.id);assert.equal(calls.length,1);
 await assert.rejects(performStageTest(owner,scenario,{...request,steps:{...steps,extract:'New instructions for extraction.'}}),e=>e.status===409);
});
test('failed, invalid, and unconfigured tests never generate a successful receipt or invented fallback',async t=>{
 configure(t,async()=>response(''));const owner=access(t);
 await assert.rejects(performStageTest(owner,scenario,input('extract')),e=>e.message.includes('no usable output'));
 delete process.env.OPENAI_API_KEY;
 await assert.rejects(runStage(scenario,'A-10',steps,'extract'),e=>e.status===503&&e.message.includes('No simulated output'));
});
test('stage tests reject invalid targets and sanitize provider failures',async t=>{
 configure(t,async()=>response(JSON.stringify({decision:{type:'merge',target_record_id:'A-10'},reason:'Invalid self merge.'})));
 await assert.rejects(runStage(scenario,'A-10',steps,'flag',{check:'Evidence'}),e=>e.message.includes('cannot target itself'));
 global.fetch=async()=>new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_DATA',code:'model_not_found'}}),{status:404,headers:{'Content-Type':'application/json'}});
 await assert.rejects(runStage(scenario,'A-10',steps,'extract'),e=>e.message.includes('model is unavailable')&&!e.message.includes('PRIVATE_PROVIDER'));
});
test('progress persistence retains history and distinguishes upstream changes, retests, expiration, and selected records',()=>{
 const p=freshProgress('A-10'),expiry=new Date(Date.now()+60000).toISOString();
 const make=(stage,ids=[])=>({id:randomUUID(),stage,record_id:'A-10',created_at:new Date().toISOString(),expires_at:expiry,output:'Stored actual output',receipt:'signed-token',steps,upstream_ids:ids});
 p.tests.extract=[make('extract')];p.tests.check=[make('check',[p.tests.extract[0].id])];p.tests.flag=[make('flag',[p.tests.extract[0].id,p.tests.check[0].id])];p.view='review';
 const restored=restoreProgress(JSON.parse(JSON.stringify(p)),['A-10','A-02']);
 assert.equal(currentTest(restored,steps,'flag').id,p.tests.flag[0].id);
 assert.equal(currentTest(restored,{...steps,check:'New evaluation instructions.'},'extract').id,p.tests.extract[0].id);
 assert.equal(currentTest(restored,{...steps,check:'New evaluation instructions.'},'flag'),undefined);
 assert.equal(currentTest(restored,steps,'flag',Date.now()+120000),undefined);
 assert.equal(currentTest({...restored,record_id:'A-02'},steps,'extract'),undefined);
 restored.tests.extract.unshift(make('extract'));
 assert.equal(currentTest(restored,steps,'check'),undefined);assert.equal(restored.tests.check.length,1);
 assert.deepEqual(restoreProgress({record_id:'unknown',tests:{}},['A-10']),freshProgress('A-10'));
});
test('request validation rejects arbitrary supplied outputs, unsupported stages, and incomplete preceding instructions',()=>{
 assert.equal(stageTestInput.safeParse({...input('extract'),output:'forged'}).success,false);
 assert.equal(stageTestInput.safeParse({...input('extract'),stage:'score'}).success,false);
 assert.equal(stageTestInput.safeParse({...input('check'),steps:{...steps,extract:''}}).success,false);
 assert.equal(stageTestInput.safeParse({...input('extract'),steps:{...steps,check:'',flag:''}}).success,true);
});

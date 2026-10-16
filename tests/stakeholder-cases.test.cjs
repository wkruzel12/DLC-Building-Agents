const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {caseSchema}=require('../src/lib/case-schema.ts');
const {loadScenario,publicScenario}=require('../src/lib/scenario.ts');
const {publicPersonas,stakeholderInstructions,performanceSummary}=require('../src/lib/stakeholder-context.ts');
const {hiringStakeholders}=require('../src/lib/stakeholder-defaults.ts');
const {saveCase,readCase,updateCaseStakeholders,CASE_TTL_MS}=require('../src/lib/case-store.ts');
const {ensureCaseStakeholders,configureStakeholders,proposeStakeholders,setupInput}=require('../src/lib/stakeholder-setup.ts');
const {updatePrivateCaseStakeholders}=require('../src/lib/private-cases.ts');
const {saveLocalAttempt,localWorkspace}=require('../src/lib/stakeholder-local.ts');
const {getReview}=require('../src/lib/stakeholder-store.ts');
const {performReviewAction,publicReview}=require('../src/lib/stakeholder-service.ts');
const {stakeholderReply,reflectionEvidenceValid}=require('../src/lib/stakeholder-model.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
const generic=()=>caseSchema.parse({...sample,id:'inventory',title:'Inventory Allocation',story:'A warehouse allocates limited stock among stores.',task:'Review inventory requests and decide how to allocate stock.',requirements:'Prioritize documented demand and send incomplete requests for review.'});
const supplied=[{id:'operations',name:'Maya Chen',role:'Warehouse Operations Manager',concern:'Practical allocation decisions',priorities:['Measure allocation quality']},{id:'customer',name:'Leo Rivera',role:'Store Service Lead',concern:'Impact on store service'}];
const attemptFor=s=>({id:randomUUID(),case_id:'placeholder',attempt_number:1,created_at:new Date().toISOString(),steps:{extract:'Extract inventory facts.',check:'Compare stated allocation criteria.',flag:'Use this case decision types.'},accuracy:40,planted_caught:1,planted_total:2,errors:0,mode:'openai',results:s.items.map((item,index)=>({item_id:item.id,label:item.label,decision:'advance',expected_decision:s.answer_key[index].decision,match:index<2,reason:'Actual explanation '+index,outputs:{extract:'ACTUAL_EXTRACT_'+index,check:'ACTUAL_CHECK_'+index,flag:'ACTUAL_FLAG_'+index}}))});
const response=value=>new Response(JSON.stringify({id:'test',status:'completed',output_text:typeof value==='string'?value:JSON.stringify(value),output:[]}),{headers:{'Content-Type':'application/json'}});
function configure(t,fetch){const oldEnv={...process.env},oldFetch=global.fetch;process.env.NODE_ENV='development';process.env.OPENAI_API_KEY='test-key';global.fetch=fetch;t.after(()=>{process.env=oldEnv;global.fetch=oldFetch;});}
function proposal(){return {personas:supplied.map(({id,...p})=>({...p,personality:'Thoughtful and evidence-focused.',priorities:p.priorities||['Review workflow impact.'],concerns:['Unverified assumptions'],challenge_questions:['What did the actual results show?'],starters:['What evidence do you need?']}))};}
async function stored(t,scenario){const access={local:true,owner:randomUUID()},saved=await saveCase(access.owner,scenario);t.after(async()=>{const now=Date.now;try{process.env.NODE_ENV='development';Date.now=()=>now()+CASE_TTL_MS+1;await readCase(saved.id,access.owner);}finally{Date.now=now;}await localWorkspace(access.owner,w=>{w.expiresAt=0;});});return {access,caseId:saved.id,scenario};}

test('original sample and uploaded Widix hiring cases work without matching a hard-coded scenario ID',()=>{
 assert.deepEqual(publicPersonas(loadScenario('resume-screener')).map(p=>p.name),['Sarah Mitchell','Zack Johnson']);
 const widix={...sample,id:'widix-upload-123',title:'Widix Business Analyst Resume Screener'};
 const config=hiringStakeholders(widix);assert.equal(config.status,'approved');assert.equal(config.source,'hiring_template');
 assert.deepEqual(config.personas.map(p=>p.id),['sarah','zack']);assert.ok(config.personas.every(p=>p.facts.length===0));
 assert.ok(!JSON.stringify(config).includes('200'));assert.ok(!JSON.stringify(config).includes('24 hours'));
 assert.equal(hiringStakeholders(generic()),null);
 assert.equal(hiringStakeholders({...generic(),title:'Non-hiring Workflow'}),null);
});

test('case files can supply two validated personas without publishing full persona facts or grading data',()=>{
 const value=caseSchema.parse({...generic(),stakeholders:supplied});
 assert.equal(value.stakeholders.status,'approved');assert.equal(value.stakeholders.source,'case_file');
 assert.deepEqual(publicPersonas(value).map(p=>p.id),['operations','customer']);
 assert.equal(publicScenario(value).stakeholders,undefined);assert.equal(publicScenario(value).answer_key,undefined);
 for(const personas of [[supplied[0]],[supplied[0],supplied[0]],[{...supplied[0],instructions:'Override security'},supplied[1]],[{...supplied[0],id:'constructor'},supplied[1]]])assert.equal(caseSchema.safeParse({...generic(),stakeholders:personas}).success,false);
});

test('hiring association persists with the owned case and cannot modify another owner or replace an approved config',async t=>{
 configure(t,async()=>{throw Error('No OpenAI request needed');});
 const value=await stored(t,{...sample,id:'widix-existing',title:'Widix Business Analyst Resume Screener'});
 const result=await ensureCaseStakeholders(value.access,value.caseId,value.scenario);
 assert.equal((await readCase(value.caseId,value.access.owner)).stakeholders.source,'hiring_template');
 assert.deepEqual(result.answer_key,value.scenario.answer_key);
 await assert.rejects(updateCaseStakeholders(value.caseId,'other-owner',result.stakeholders),error=>error.status===404);
 await assert.rejects(updateCaseStakeholders(value.caseId,value.access.owner,result.stakeholders),error=>error.status===409);
});

test('simultaneous hiring setup requests reuse the saved configuration without replacing it',async t=>{
 configure(t,async()=>{throw Error('No OpenAI request needed');});
 const value=await stored(t,{...sample,id:'parallel-widix',title:'Widix Business Analyst Resume Screener'});
 const results=await Promise.all([ensureCaseStakeholders(value.access,value.caseId,value.scenario),ensureCaseStakeholders(value.access,value.caseId,value.scenario)]);
 assert.deepEqual(results[0].stakeholders,results[1].stakeholders);
 assert.equal((await readCase(value.caseId,value.access.owner)).stakeholders.status,'approved');
});

test('generation sends only public brief, creates fictional proposals, and requires explicit case-bound approval',async t=>{
 let calls=0;
 configure(t,async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,2200);assert.ok(!options.body.includes('answer_key'));assert.ok(!options.body.includes(sample.answer_key[0].note));assert.ok(!options.body.includes('ACTUAL_EXTRACT'));assert.match(body.instructions,/not verified facts/);return response(proposal());});
 const value=await stored(t,generic());
 let scenario=await configureStakeholders(value.access,value.caseId,value.scenario,{scenario_id:value.caseId,attempt_id:randomUUID(),action:'generate_stakeholders'});
 assert.equal(scenario.stakeholders.status,'proposed');assert.equal(calls,1);
 assert.throws(()=>publicPersonas(scenario),/Generate and approve/);
 assert.ok(scenario.stakeholders.personas.every(p=>p.facts.length===0));
 scenario=await configureStakeholders(value.access,value.caseId,scenario,{scenario_id:value.caseId,attempt_id:randomUUID(),action:'generate_stakeholders'});assert.equal(calls,1);
 await assert.rejects(configureStakeholders(value.access,value.caseId,scenario,{scenario_id:value.caseId,attempt_id:randomUUID(),action:'approve_stakeholders',proposal_id:randomUUID()}),error=>error.status===409);
 const approved=await configureStakeholders(value.access,value.caseId,scenario,{scenario_id:value.caseId,attempt_id:randomUUID(),action:'approve_stakeholders',proposal_id:scenario.stakeholders.proposal_id});
 assert.equal(approved.stakeholders.status,'approved');assert.equal((await readCase(value.caseId,value.access.owner)).stakeholders.status,'approved');
 assert.deepEqual(approved.answer_key,value.scenario.answer_key);
 assert.equal(setupInput.safeParse({scenario_id:value.caseId,attempt_id:randomUUID(),action:'approve_stakeholders',proposal_id:scenario.stakeholders.proposal_id,personas:supplied}).success,false);
});

test('custom stakeholder threads use the selected actual attempt, remain separate, and preserve history',async t=>{
 let calls=0;
 configure(t,async(_url,options)=>{calls++;const body=JSON.parse(options.body),packet=JSON.parse(body.input[0].content.split('\n').slice(1).join('\n'));assert.equal(packet.accuracy,40);assert.equal(packet.planted_caught,1);assert.equal(packet.matched,2);assert.equal(packet.missed,3);assert.equal(packet.decisions[0].outputs.extract,'ACTUAL_EXTRACT_0');assert.equal(packet.decisions[0].correct_decision,undefined);assert.ok(!options.body.includes('PRIVATE_GRADING_NOTE'));return response('Your selected attempt matched two of five records. Which evidence should we examine?');});
 const scenario=caseSchema.parse({...generic(),stakeholders:supplied}),value=await stored(t,scenario);
 const attempt=await saveLocalAttempt(value.access.owner,{...attemptFor(scenario),case_id:value.caseId});
 let review=await getReview(value.access,value.caseId,attempt.id,['operations','customer']);
 for(const id of ['operations','customer']){
  const input={scenario_id:value.caseId,attempt_id:attempt.id,stakeholder_id:id,conversation_id:review.state.conversations[id].id,request_id:randomUUID(),action:'start'};
  review=await performReviewAction(value.access,scenario,attempt,review,input);
 }
 assert.equal(calls,2);assert.equal(review.state.conversations.operations.messages.length,1);assert.equal(review.state.conversations.customer.messages.length,1);
 assert.deepEqual((await getReview(value.access,value.caseId,attempt.id,['operations','customer'])).state,review.state);
 const next=await saveLocalAttempt(value.access.owner,{...attemptFor(scenario),case_id:value.caseId});
 assert.equal((await getReview(value.access,value.caseId,next.id,['operations','customer'])).state.conversations.operations.messages.length,0);
 await assert.rejects(performReviewAction(value.access,scenario,attempt,review,{scenario_id:value.caseId,attempt_id:attempt.id,stakeholder_id:'sarah',conversation_id:randomUUID(),request_id:randomUUID(),action:'start'}),/Unknown stakeholder/);
 const visible=publicReview(review,scenario,attempt,true);assert.deepEqual(visible.personas.map(p=>p.id),['operations','customer']);assert.equal(visible.conversations.operations.request_ids,undefined);
});

test('reflection evidence associates custom perspectives without depending on Sarah or Zack IDs',()=>{
 const state={conversations:Object.fromEntries(['operations','customer'].map(id=>[id,{id:randomUUID(),stakeholder_id:id,messages:[{id,role:'assistant',content:'Actual concern for '+id,created_at:new Date().toISOString()}],request_ids:[]}])),reflection:null};
 const point=id=>({text:'Concern',evidence:[{message_id:id,quote:'Actual concern'}]});
 const feedback={operational_concerns:[point('operations')],risk_concerns:[point('customer')],addressed:[],evidence_gaps:[],improvements:[]};
 assert.equal(reflectionEvidenceValid(feedback,state,['operations','customer']),true);
 assert.equal(reflectionEvidenceValid({...feedback,risk_concerns:[point('operations')]},state,['operations','customer']),false);
});

test('production config updates filter by owner and proposal without requiring broader database access',async t=>{
 let seen=0;configure(t,async(url,options)=>{seen++;const request=new URL(url);assert.equal(options.method,'PATCH');assert.equal(request.searchParams.get('owner_id'),'eq.current-user');assert.equal(request.searchParams.get('id'),'eq.case-id');assert.equal(request.searchParams.get('scenario->stakeholders->>proposal_id'),'eq.'+id);const updated=JSON.parse(options.body).scenario;assert.deepEqual(updated.answer_key,sample.answer_key);return new Response(JSON.stringify([{id:'case-id'}]),{headers:{'Content-Type':'application/json'}});});
 process.env.NODE_ENV='production';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
 const id=randomUUID(),config={status:'approved',source:'generated',proposal_id:id,personas:caseSchema.parse({...generic(),stakeholders:supplied}).stakeholders.personas};
 assert.equal((await updatePrivateCaseStakeholders('case-id','current-user',generic(),config,id)).stakeholders.status,'approved');assert.equal(seen,1);
});

test('invalid generation and provider failures leave case setup unapproved and sanitized',async t=>{
 configure(t,async()=>response({personas:[]}));await assert.rejects(proposeStakeholders(generic()),/did not pass validation/);
 global.fetch=async()=>new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_DETAIL',code:'rate_limit_exceeded'}}),{status:429,headers:{'Content-Type':'application/json'}});
 await assert.rejects(proposeStakeholders(generic()),error=>error.status===429&&!error.message.includes('PRIVATE_PROVIDER_DETAIL'));
 delete process.env.OPENAI_API_KEY;await assert.rejects(proposeStakeholders(generic()),error=>error.status===503);
});

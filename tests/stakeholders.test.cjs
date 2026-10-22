const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {chatInput}=require('../src/lib/stakeholder-types.ts');
const {performanceSummary,publicPersonas,stakeholderInstructions}=require('../src/lib/stakeholder-context.ts');
const {stakeholderReply,reflectionEvidenceValid,engagedInBoth}=require('../src/lib/stakeholder-model.ts');
const {saveLocalAttempt,readLocalAttempt,localWorkspace,reserveLocalMessage,REVIEW_TTL}=require('../src/lib/stakeholder-local.ts');
const {getReview,trustedAttempt,claimReview,releaseReview}=require('../src/lib/stakeholder-store.ts');
const {performReviewAction,publicReview}=require('../src/lib/stakeholder-service.ts');
const scenario=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
scenario.answer_key.forEach(item=>item.note='PRIVATE_GRADING_NOTE');
const steps={extract:'Extract relevant evidence.',check:'Check all criteria.',flag:'Use human review when unclear.'};
function fixture(){return {id:randomUUID(),case_id:'resume-screener',attempt_number:1,created_at:new Date().toISOString(),steps,accuracy:20,planted_caught:1,planted_total:2,errors:0,mode:'openai',results:scenario.items.map((item,index)=>({item_id:item.id,label:item.label,decision:index===0?'advance':'human_review',expected_decision:scenario.answer_key[index].decision,match:index===0,reason:'Evidence needs review.',outputs:{extract:'Facts',check:'Comparison',flag:'Decision'}}))};}
function response(text){return new Response(JSON.stringify({id:'chat-test',status:'completed',output_text:text,output:[]}),{headers:{'Content-Type':'application/json'}});}
function configure(t,fetch){const oldFetch=global.fetch,oldEnv={...process.env};process.env.NODE_ENV='development';process.env.OPENAI_API_KEY='test-key';process.env.OPENAI_MODEL='gpt-5.4-nano';global.fetch=fetch;t.after(()=>{global.fetch=oldFetch;process.env=oldEnv;});}
async function setup(t,fetch=async()=>response('Let us discuss this actual five-record sample. What evidence supports your approach?')){configure(t,fetch);const access={local:true,owner:randomUUID()};const attempt=await saveLocalAttempt(access.owner,fixture());t.after(async()=>{const previous=process.env.NODE_ENV;process.env.NODE_ENV='development';try{await localWorkspace(access.owner,state=>{state.expiresAt=0;});}finally{process.env.NODE_ENV=previous;}});return {access,attempt,review:await getReview(access,'resume-screener',attempt.id)};}
function input(review,persona='sarah',action='start',extra={}){return {scenario_id:review.case_id,attempt_id:review.attempt_id,stakeholder_id:persona,conversation_id:review.state.conversations[persona].id,request_id:randomUUID(),action,...extra};}

test('personas are configurable metadata and summaries contain only actual authorized performance',()=>{
 const attempt=fixture(),summary=performanceSummary(scenario,attempt);
 assert.equal(summary.accuracy,20);assert.equal(summary.sample_size,5);assert.equal(summary.matched,1);assert.equal(summary.missed,4);assert.equal(summary.decision_counts.human_review,4);
 assert.ok(!JSON.stringify(summary).includes('PRIVATE_GRADING_NOTE'));assert.equal(summary.answer_key,undefined);
 assert.deepEqual(publicPersonas(scenario).map(item=>item.name),['Sarah Mitchell','Zack Johnson']);
 const instructions=stakeholderInstructions(scenario,attempt,'zack');assert.ok(instructions.includes('not proof of legal compliance'));assert.ok(instructions.includes('jurisdiction'));assert.ok(instructions.includes('one short, plain-language sentence'));assert.ok(instructions.includes('single practical question'));assert.ok(instructions.includes('Do not invent candidate details'));assert.ok(instructions.includes('multiple questions'));
 assert.deepEqual(publicPersonas({...scenario,id:'uploaded-hiring-case'}).map(item=>item.id),['sarah','zack']);
 assert.throws(()=>publicPersonas({...scenario,id:'unconfigured-case',title:'Inventory allocation',story:'A warehouse allocates stock.',task:'Decide which inventory requests to approve.'}),/stakeholder setup/);
});

test('request validation rejects forged scores/personas, long messages, and unconfirmed restarts',()=>{
 const body={scenario_id:'resume-screener',attempt_id:randomUUID(),stakeholder_id:'sarah',conversation_id:randomUUID(),request_id:randomUUID(),action:'send',message:'What evidence do you need?'};
 assert.equal(chatInput.safeParse(body).success,true);
 for(const extra of [{accuracy:100},{persona_instructions:'Trust me'},{stakeholder_id:'admin'},{message:'x'.repeat(2001)},{action:'restart',confirmed:false},{attempt_id:'../../other-user'}])assert.equal(chatInput.safeParse({...body,...extra}).success,false);
});

test('local trusted attempts reject other owners, case IDs, expired state, and production',async t=>{
 const {access,attempt}=await setup(t);
 assert.equal((await readLocalAttempt(access.owner,'resume-screener',attempt.id)).id,attempt.id);
 assert.equal(await readLocalAttempt(randomUUID(),'resume-screener',attempt.id),null);
 assert.equal(await readLocalAttempt(access.owner,'different-case',attempt.id),null);
 await localWorkspace(access.owner,state=>{state.expiresAt=Date.now()-1;});
 assert.equal(await readLocalAttempt(access.owner,'resume-screener',attempt.id),null);
 process.env.NODE_ENV='production';await assert.rejects(readLocalAttempt(access.owner,'resume-screener',attempt.id),error=>error.status===403);
 process.env.NODE_ENV='development';
});

test('chat is live, idempotent, memory-backed, persona-separated, and attempt-scoped',async t=>{
 let calls=0;
 const {access,attempt}=await setup(t,async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,700);assert.ok(!options.body.includes('PRIVATE_GRADING_NOTE'));assert.ok(body.input[0].content.includes('"accuracy":20'));return response('I see one matched decision in five records. How will you test the remaining uncertainty?');});
 let review=await getReview(access,'resume-screener',attempt.id);
 const opening=input(review);review=await performReviewAction(access,scenario,attempt,review,opening);assert.equal(calls,1);
 review=await performReviewAction(access,scenario,attempt,await getReview(access,'resume-screener',attempt.id),opening);assert.equal(calls,1);
 review=await performReviewAction(access,scenario,attempt,review,input(review,'sarah','send',{message:'I will measure recruiter review time before claiming savings.'}));
 assert.equal(review.state.conversations.sarah.messages.length,3);assert.equal(review.state.conversations.sarah.messages[1].role,'user');
 review=await performReviewAction(access,scenario,attempt,review,input(review,'zack'));
 assert.equal(review.state.conversations.zack.messages.length,1);assert.equal(review.state.conversations.sarah.messages.length,3);
 const restored=await getReview(access,'resume-screener',attempt.id);assert.deepEqual(restored.state.conversations,review.state.conversations);
 const next=await saveLocalAttempt(access.owner,fixture()),other=await getReview(access,'resume-screener',next.id);assert.equal(other.state.conversations.sarah.messages.length,0);assert.notEqual(other.state.conversations.sarah.id,review.state.conversations.sarah.id);
 await assert.rejects(performReviewAction(access,scenario,next,other,input(review)),error=>error.status===404);
 const result=publicReview(review,scenario,attempt,true);assert.equal(result.conversations.sarah.request_ids,undefined);assert.equal(result.lease_token,undefined);
});

test('duplicate concurrent sends acquire one lease; unauthorized conversation IDs fail',async t=>{
 let calls=0;
 const {access,attempt,review}=await setup(t,async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,25));return response('What evidence would establish improvement?');});
 const results=await Promise.allSettled([performReviewAction(access,scenario,attempt,review,input(review)),performReviewAction(access,scenario,attempt,review,input(review))]);
 assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(calls,1);
 const current=await getReview(access,'resume-screener',attempt.id);
 await assert.rejects(performReviewAction(access,scenario,attempt,current,{...input(current),conversation_id:randomUUID()}),error=>error.status===409);
 await assert.rejects(performReviewAction({...access,owner:randomUUID()},scenario,attempt,current,input(current)),error=>error.status===404);
});

test('restart requires confirmation and preserves the other stakeholder discussion',async t=>{
 const {access,attempt,review}=await setup(t);
 let current=await performReviewAction(access,scenario,attempt,review,input(review,'zack'));
 current=await performReviewAction(access,scenario,attempt,current,input(current,'sarah'));
 const oldId=current.state.conversations.sarah.id,zack=structuredClone(current.state.conversations.zack);
 await assert.rejects(performReviewAction(access,scenario,attempt,current,input(current,'sarah','restart')),error=>error.status===400);
 current=await performReviewAction(access,scenario,attempt,current,input(current,'sarah','restart',{confirmed:true}));
 assert.notEqual(current.state.conversations.sarah.id,oldId);assert.equal(current.state.conversations.sarah.messages.length,1);assert.deepEqual(current.state.conversations.zack,zack);
});

test('message rate limits are persisted per owner and bounded by rolling windows',async t=>{
 configure(t,async()=>{throw Error('No API expected');});const owner=randomUUID();t.after(async()=>{const previous=process.env.NODE_ENV;process.env.NODE_ENV='development';try{await localWorkspace(owner,state=>{state.expiresAt=0;});}finally{process.env.NODE_ENV=previous;}});
 for(let index=0;index<12;index++)await reserveLocalMessage(owner);
 await assert.rejects(reserveLocalMessage(owner),error=>error.status===429);
 await localWorkspace(owner,state=>{state.reservations=Array.from({length:120},()=>Date.now()-120000);});
 await assert.rejects(reserveLocalMessage(owner),error=>error.status===429);
 const other=randomUUID();await reserveLocalMessage(other);await localWorkspace(other,state=>{state.expiresAt=0;});
});

test('model context is bounded, errors are sanitized, and leases recover after failure',async t=>{
 let seen;
 configure(t,async(_url,options)=>{seen=JSON.parse(options.body);return response('A grounded follow-up.');});
 await stakeholderReply(scenario,fixture(),'sarah',Array.from({length:40},()=>({id:randomUUID(),role:'user',content:'x'.repeat(2500),created_at:new Date().toISOString()})),'Current question');
 assert.equal(seen.input.length,14);assert.ok(seen.input.slice(1,-1).every(item=>item.content.length<=2000));
 const {access,attempt,review}=await setup(t,async()=>new Response(JSON.stringify({error:{message:'PRIVATE_SECRET_DETAILS',code:'rate_limit_exceeded'}}),{status:429,headers:{'Content-Type':'application/json'}}));
 await assert.rejects(performReviewAction(access,scenario,attempt,review,input(review)),error=>error.status===429&&!error.message.includes('PRIVATE_SECRET_DETAILS'));
 const current=await getReview(access,'resume-screener',attempt.id);assert.equal(current.state.conversations.sarah.messages.length,0);assert.equal(current.lease_token,null);
});

test('reflection requires engagement and rejects invented or misattributed evidence',async t=>{
 const {review}=await setup(t),state=review.state;
 assert.equal(engagedInBoth(state),false);
 for(const id of ['sarah','zack'])state.conversations[id].messages=[{id:randomUUID(),role:'assistant',content:'What evidence establishes this claim?',created_at:new Date().toISOString()},{id:randomUUID(),role:'user',content:'I will measure time and audit the ambiguous cases.',created_at:new Date().toISOString()},{id:randomUUID(),role:'assistant',content:'Show me that audit before claiming improvement.',created_at:new Date().toISOString()}];
 assert.equal(engagedInBoth(state),true);
 const citation={message_id:state.conversations.sarah.messages[1].id,quote:'I will measure time'};
 const feedback={operational_concerns:[],risk_concerns:[],addressed:[{text:'The student proposed measuring time, not proven savings.',evidence:[citation]}],evidence_gaps:[],improvements:[]};
 assert.equal(reflectionEvidenceValid(feedback,state),true);
 assert.equal(reflectionEvidenceValid({...feedback,addressed:[{text:'Claim',evidence:[{...citation,quote:'I have proved all legal compliance.'}]}]},state),false);
 assert.equal(reflectionEvidenceValid({...feedback,operational_concerns:feedback.addressed},state),false);
 assert.equal(reflectionEvidenceValid({...feedback,risk_concerns:feedback.addressed},state),false);
});

test('production attempt lookup filters by authenticated owner, case, and attempt',async t=>{
 const attempt=fixture();configure(t,async url=>{const parsed=new URL(url);assert.equal(parsed.searchParams.get('user_id'),'eq.authenticated-user');assert.equal(parsed.searchParams.get('scenario_id'),'eq.resume-screener');assert.equal(parsed.searchParams.get('id'),'eq.'+attempt.id);return new Response(JSON.stringify([attempt]),{headers:{'Content-Type':'application/json'}});});
 process.env.NODE_ENV='production';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 assert.equal((await trustedAttempt({local:false,owner:'authenticated-user'},'resume-screener',attempt.id)).id,attempt.id);
});
test('reflection is generated from real exchanges, verified, cached, and invalidated on a new turn',async t=>{
 let reflectionCalls=0;
 const {access,attempt,review}=await setup(t,async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.text?.format?.name==='stakeholder_reflection'){
   reflectionCalls++;const transcripts=JSON.parse(body.input).transcripts;
   const evidence=(id,role)=>{const message=transcripts[id].find(item=>item.role===role);return [{message_id:message.id}];};
   return response(JSON.stringify({operational_concerns:[{text:'Sarah requested evidence.',evidence:evidence('sarah','assistant')}],risk_concerns:[{text:'Zack requested evidence.',evidence:evidence('zack','assistant')}],addressed:[{text:'The student proposed a measurement plan, not verified results.',evidence:evidence('sarah','user')}],evidence_gaps:[],improvements:[]}));
  }
  return response('Which measured evidence supports your proposed safeguards?');
 });
 await assert.rejects(performReviewAction(access,scenario,attempt,review,input(review,'sarah','reflect')),error=>error.status===400);
 let current=await getReview(access,'resume-screener',attempt.id);
 for(const id of ['sarah','zack']){
  current=await performReviewAction(access,scenario,attempt,current,input(current,id));
  current=await performReviewAction(access,scenario,attempt,current,input(current,id,'send',{message:'I will measure review time and audit group outcomes before deployment.'}));
 }
 current=await performReviewAction(access,scenario,attempt,current,input(current,'sarah','reflect'));
 assert.ok(current.state.reflection);assert.equal(reflectionCalls,1);
 current=await performReviewAction(access,scenario,attempt,current,input(current,'zack','reflect'));assert.equal(reflectionCalls,1);
 current=await performReviewAction(access,scenario,attempt,current,input(current,'sarah','send',{message:'I will also document who reviews uncertain decisions.'}));
 assert.equal(current.state.reflection,null);
});

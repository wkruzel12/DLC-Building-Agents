const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {studentAttempt,investigation,resultCounts,compareAttempts,learningPhase,validReflection}=require('../src/lib/results-learning.ts');
const {learningTarget}=require('../src/lib/learning-config.ts');
const {localWorkspace,saveLocalAttempt}=require('../src/lib/stakeholder-local.ts');
const {readLearning,writeLearning,requireReflection,completedCount,learningHistory}=require('../src/lib/attempt-learning-store.ts');
const {coachAttempt}=require('../src/lib/results-coaching.ts');
const {loadScenario}=require('../src/lib/scenario.ts');
const {score}=require('../src/lib/runner.ts');
const {reviewAllowed}=require('../src/lib/results-learning.ts');
const steps={extract:'Find source evidence.',check:'Compare public requirements.',flag:'Choose a supported action.'};
const fixture=(extra={})=>({id:randomUUID(),case_id:'resume-screener',attempt_number:1,created_at:new Date().toISOString(),steps,accuracy:40,planted_caught:1,planted_total:2,errors:0,mode:'openai',results:[{item_id:'A-10',label:'Record 10',decision:{type:'merge',target_record_id:'A-02'},expected_decision:'PRIVATE_EXPECTED_ACTION',match:false,reason:'Actual recorded reasoning.',outputs:{extract:'ACTUAL_EXTRACT',check:'ACTUAL_CHECK',flag:'ACTUAL_FLAG'},note:'PRIVATE_NOTE'}],...extra});
function configure(t){const env={...process.env},fetch=global.fetch;process.env.NODE_ENV='development';process.env.LEARNING_TARGET_ACCURACY='80';process.env.OPENAI_API_KEY='test-coaching-key';t.after(()=>{process.env=env;global.fetch=fetch;});}
function owner(t){const access={local:true,owner:randomUUID()};t.after(async()=>{process.env.NODE_ENV='development';await localWorkspace(access.owner,w=>{w.expiresAt=0;});});return access;}
const response=value=>new Response(JSON.stringify({id:'coach',status:'completed',output_text:JSON.stringify(value),output:[]}),{headers:{'Content-Type':'application/json'}});

test('student attempt serialization removes legacy expected decisions and private record fields without changing scores or IDs',()=>{
 const original=fixture(),value=studentAttempt(original);assert.equal(value.accuracy,40);assert.equal(value.results[0].item_id,'A-10');assert.deepEqual(value.results[0].decision,{type:'merge',target_record_id:'A-02'});assert.equal(value.results[0].expected_decision,undefined);assert.equal(value.results[0].note,undefined);assert.ok(!JSON.stringify(value).includes('PRIVATE_'));assert.equal(original.results[0].expected_decision,'PRIVATE_EXPECTED_ACTION');
});
test('learning target, phases, and differences use actual scores and do not impose a three-attempt limit',t=>{
 configure(t);assert.equal(learningTarget(),80);process.env.LEARNING_TARGET_ACCURACY='75';assert.equal(learningTarget(),75);process.env.LEARNING_TARGET_ACCURACY='invalid';assert.equal(learningTarget(),80);
 assert.equal(learningPhase(1),'Discover');assert.equal(learningPhase(2),'Understand');assert.equal(learningPhase(3),'AI-assisted improvement');assert.equal(learningPhase(12),'Continuing improvement');
 const a=fixture(),b=fixture({accuracy:65,steps:{...steps,check:'A revised comparison instruction.'},results:[{...a.results[0],decision:'retain',match:true}]});
 assert.deepEqual(resultCounts(a),{correct:0,incorrect:1,total:1});assert.deepEqual(compareAttempts(a,b),{difference:25,changedStages:['check'],changedOutcomes:['A-10']});assert.equal(validReflection('Too short'),false);assert.equal(validReflection('I will clarify missing evidence because uncertainty matters.'),true);
});
test('investigation guidance never assigns an unsupported causal stage and becomes more contextual on later attempts',()=>{
 const record=fixture().results[0],first=investigation(record,1),second=investigation(record,2);assert.equal(first.observed,null);assert.notDeepEqual(first.questions,second.questions);assert.ok(!JSON.stringify(second).includes('PRIVATE_'));
 const failed=investigation({...record,error:'Request failed',outputs:{extract:'Facts',check:'',flag:''}},2);assert.equal(failed.observed.stage,'check');assert.match(failed.observed.text,/upstream/);
});
test('reflections are owner- and attempt-scoped, survive history reads, and gate only another below-target full run',async t=>{
 configure(t);const access=owner(t),other=owner(t);const a=await saveLocalAttempt(access.owner,fixture());
 await assert.rejects(requireReflection(access,a.case_id),e=>e.status===409);
 await assert.rejects(writeLearning(other,a.case_id,a.id,{reflection:'Forged access to another attempt.'}),e=>e.status===404);
 const saved=await writeLearning(access,a.case_id,a.id,{reflection:'I will clarify missing evidence so the agent can handle uncertainty.'});assert.ok(validReflection(saved.reflection));await requireReflection(access,a.case_id);
 const b=await saveLocalAttempt(access.owner,fixture({id:randomUUID(),created_at:new Date(Date.now()+1000).toISOString()}));assert.equal(await completedCount(access,a.case_id),2);await assert.rejects(requireReflection(access,a.case_id),e=>e.status===409);
 const history=await learningHistory(access,a.case_id,[b,a]);assert.equal(history[0].completed_index,2);assert.equal(history[1].completed_index,1);assert.equal(history[1].learning.reflection,saved.reflection);assert.equal(history[0].results[0].expected_decision,undefined);
 await saveLocalAttempt(access.owner,fixture({accuracy:80,created_at:new Date(Date.now()+2000).toISOString()}));await requireReflection(access,a.case_id);
});
test('completed progression counts saved full simulations rather than stage tests or reservation numbers',async t=>{
 configure(t);const access=owner(t);await localWorkspace(access.owner,w=>{w.reservations.push(Date.now(),Date.now());});assert.equal(await completedCount(access,'resume-screener'),0);
 for(let i=0;i<4;i++)await saveLocalAttempt(access.owner,fixture({attempt_number:10+i,created_at:new Date(Date.now()+i*1000).toISOString()}));assert.equal(await completedCount(access,'resume-screener'),4);
});
test('stakeholder handoff accepts the newly saved acknowledgment without requiring a prior React state update',()=>{
 const attempt=fixture(),saved={reflection:'I will examine the evidence behind each missed decision.',acknowledged_below_target:true};
 assert.equal(reviewAllowed(attempt,80,3),false);
 assert.equal(reviewAllowed({...attempt,learning:saved},80,3),true);
 assert.equal(reviewAllowed({...attempt,learning:saved},80,2),false);
 assert.equal(reviewAllowed(fixture({accuracy:80}),80,1),true);
 assert.equal(reviewAllowed({...attempt,learning:saved},80,9),true);
});
test('real AI coaching is evidence-linked, bounded, optional, and never receives expected decisions or private notes',async t=>{
 configure(t);let calls=0;const attempt=fixture(),original=JSON.stringify(attempt.steps);global.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.ok(body.max_output_tokens<=1800);assert.ok(!options.body.includes('PRIVATE_EXPECTED_ACTION'));assert.ok(!options.body.includes('PRIVATE_NOTE'));const packet=JSON.parse(body.input);assert.equal(packet.records[0].id,'A-10');assert.equal(packet.records[0].stages.check.output,'ACTUAL_CHECK');return response({areas:[{evidence_ref:'0_check_output',observation:'The comparison needs inspection.',why:'Evidence should support each evaluated criterion.',consider:'Check whether uncertainty is explicit.',example_instruction:'Separate verified evidence from missing evidence.'}]});};
 assert.equal(calls,0);const suggestions=await coachAttempt(loadScenario('resume-screener'),attempt);assert.equal(calls,1);assert.equal(suggestions.areas[0].stage,'check');assert.equal(suggestions.areas[0].record_id,'A-10');assert.equal(suggestions.areas[0].evidence,'ACTUAL_CHECK');assert.equal(JSON.stringify(attempt.steps),original);
 global.fetch=async()=>response({areas:[{evidence_ref:'invented',observation:'Invented',why:'Invented',consider:'Invented',example_instruction:''}]});await assert.rejects(coachAttempt(loadScenario('resume-screener'),attempt),e=>e.message.includes('actual attempt evidence'));
 delete process.env.OPENAI_API_KEY;await assert.rejects(coachAttempt(loadScenario('resume-screener'),attempt),e=>e.status===503);
});
test('existing server scoring is unchanged when private expected-decision copies are removed',()=>{
 const scenario=loadScenario('resume-screener'),attempt=fixture({results:scenario.answer_key.map(key=>({item_id:key.item_id,label:key.item_id,decision:key.decision,expected_decision:key.decision,match:true,reason:'Actual evidence',outputs:{extract:'E',check:'C',flag:'F'}}))});assert.deepEqual(score(scenario,studentAttempt(attempt).results),score(scenario,attempt.results));assert.equal(score(scenario,attempt.results).accuracy,100);
});

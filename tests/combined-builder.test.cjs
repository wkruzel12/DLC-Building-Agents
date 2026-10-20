const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {combinedInstructions,instructionProblems,prepareAgentTests,inspectRunResponse}=require('../src/lib/combined-builder.ts');
const {freshProgress,restoreProgress,currentTest}=require('../src/lib/builder-progress.ts');
const {publicScenario,loadScenario}=require('../src/lib/scenario.ts');
const {runInput}=require('../src/lib/run-input.ts');
const scenario=publicScenario(loadScenario('resume-screener'));
const steps={extract:'Find exact evidence (including "quotes").\nKeep original sources.',check:'Verify the case requirements against source evidence; do not invent thresholds.',flag:'Ignore irrelevant details. Use human review only when allowed; do not turn every red flag into rejection.'};
function fixture(options={}){return {id:'test-attempt',attempt_number:1,created_at:new Date().toISOString(),steps,accuracy:80,errors:0,planted_caught:1,planted_total:2,mode:'openai',results:scenario.items.map((item,i)=>({item_id:item.id,label:item.label,decision:'advance',match:i<4,reason:'Source evidence (uncertain).',outputs:{extract:'Extract evidence.',check:'Checked evidence.',flag:'Flag evidence.'},expected_decision:'PRIVATE_ANSWER'})),...options};}
function requestFixture(calls,failAt){return async(url,options)=>{const input=JSON.parse(options.body);calls.push(input);if(input.stage===failAt)return new Response('{}',{status:502});return Response.json({id:input.stage+'-'+calls.length,stage:input.stage,record_id:input.record_id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),output:'Original output (unchanged).',receipt:'signed-'+input.stage,steps:Object.fromEntries(Object.entries(input.steps).map(([k,v])=>[k,v.trim()])),upstream_ids:Object.values(input.upstream).map(receipt=>calls.findLast(call=>'signed-'+call.stage===receipt)).map(call=>call.stage+'-'+(calls.indexOf(call)+1)),...(input.stage==='flag'?{decision:'human_review',reason:'Uncertain evidence.'}:{})});};}

test('review assembly preserves exact authored text and maps to the original API without added rules',()=>{
 assert.equal(combinedInstructions(steps),`LOOK FOR:\n${steps.extract}\n\nVERIFY:\n${steps.check}\n\nDON'T INCLUDE:\n${steps.flag}`);
 assert.deepEqual(runInput.parse({case_id:scenario.id,steps}).steps,steps);
 assert.equal(instructionProblems(steps).length,0);assert.equal(instructionProblems({...steps,check:''})[0].id,'check');
 assert.match(instructionProblems({...steps,flag:'x'.repeat(1501)})[0].message,/full draft is saved/);
});

test('one combined test preserves all signed operations, their exact order, receipts, and test history',async()=>{
 const calls=[],saved=[];
 const progress=await prepareAgentTests({caseId:scenario.id,scenario,steps,progress:freshProgress('r01'),request:requestFixture(calls),onProgress:value=>saved.push(value)});
 assert.deepEqual(calls.map(call=>call.stage),['extract','check','flag']);assert.equal(saved.length,3);
 assert.deepEqual(calls[1].upstream,{extract:'signed-extract'});assert.deepEqual(calls[2].upstream,{extract:'signed-extract',check:'signed-check'});
 for(const call of calls)assert.deepEqual(call.steps,steps);
 for(const stage of ['extract','check','flag'])assert.ok(currentTest(progress,steps,stage));
 await prepareAgentTests({caseId:scenario.id,scenario,steps,progress,request:requestFixture(calls),onProgress:()=>{}});assert.equal(calls.length,3,'valid prerequisites reuse their receipts');
 const changed={...steps,check:steps.check+' Recheck missing facts.'};
 const retest=[...calls];let revised;await prepareAgentTests({caseId:scenario.id,scenario,steps:changed,progress,request:requestFixture(retest),onProgress:value=>{revised=value;}});
 assert.deepEqual(retest.slice(calls.length).map(call=>call.stage),['check','flag']);assert.equal(revised.tests.check.length,2);
});

test('failed AI calls stop the chain and retain successful earlier readiness evidence',async()=>{
 const calls=[],saved=[];
 await assert.rejects(prepareAgentTests({caseId:scenario.id,scenario,steps,progress:freshProgress('r01'),request:requestFixture(calls,'check'),onProgress:value=>saved.push(value)}),/could not finish/);
 assert.deepEqual(calls.map(call=>call.stage),['extract','check']);assert.equal(saved.length,1);assert.equal(saved[0].tests.extract.length,1);
});

test('malformed, expired, wrong-record, wrong-chain, and forbidden decisions cannot authorize a graded run',async()=>{
 for(const patch of [{record_id:'other'},{output:''},{receipt:''},{steps:{...steps,check:'Changed instructions.'}},{expires_at:'invalid'},{expires_at:new Date(0).toISOString()},{upstream_ids:['invented']}]){
  const calls=[],base=requestFixture(calls);await assert.rejects(prepareAgentTests({caseId:scenario.id,scenario,steps,progress:freshProgress('r01'),onProgress:()=>{},request:async(...args)=>{const r=await base(...args);return Response.json({...await r.json(),...patch});}}));
 }
 const calls=[],base=requestFixture(calls);await assert.rejects(prepareAgentTests({caseId:scenario.id,scenario,steps,progress:freshProgress('r01'),onProgress:()=>{},request:async(...args)=>{const r=await base(...args),v=await r.json();return Response.json({...v,...(v.stage==='flag'?{decision:'unsupported_action'}:{})});}}),/invalid readiness/);
});

test('valid grades use reported accuracy, exact records and target rules, and exclude private answers',()=>{
 const outcome=inspectRunResponse(fixture(),scenario,steps);assert.equal(outcome.kind,'complete');assert.equal(outcome.attempt.accuracy,80);assert.equal(outcome.attempt.results.length,5);assert.ok(!JSON.stringify(outcome).includes('PRIVATE_ANSWER'));
 const error=fixture();error.results[0]={...error.results[0],decision:'error',match:false,error:'Provider failure'};error.accuracy=60;error.errors=1;assert.equal(inspectRunResponse(error,scenario,steps).kind,'complete','existing error-count grading is preserved');
});

test('missing, partial, duplicate, invalid, or inconsistent grading never displays a fabricated score',()=>{
 for(const value of [null,{},fixture({accuracy:undefined}),fixture({accuracy:100}),fixture({accuracy:NaN}),fixture({results:fixture().results.slice(0,3)}),fixture({results:[...fixture().results.slice(0,4),fixture().results[0]]}),fixture({steps:{...steps,extract:'Unrelated instructions.'}}),fixture({errors:2})]){
  const result=inspectRunResponse(value,scenario,steps);assert.equal(result.kind,'incomplete');assert.equal('accuracy' in result,false);assert.ok(!JSON.stringify(result).includes('PRIVATE_ANSWER'));
 }
 const forged=fixture();forged.results[0].decision={type:'advance',target_record_id:'r01'};assert.equal(inspectRunResponse(forged,scenario,steps).kind,'incomplete');
});

test('new views and legacy stage drafts restore without dropping prior test history',()=>{
 for(const view of ['write','review','results','intro','extract','check','flag']){const saved=restoreProgress({...freshProgress('r01'),view},scenario.items.map(item=>item.id));assert.equal(saved.view,view);assert.equal(saved.record_id,'r01');}
});

test('uploaded non-hiring cases retain exact target decisions and reject self or nonexistent targets',()=>{
 const uploaded={...scenario,decisions:['retain','merge','human_review'],items:[{id:'A-02',label:'First request',text:'Demand evidence.'},{id:'A-10',label:'Duplicate request',text:'References A-02.'}]};
 const value=fixture({accuracy:100,planted_caught:0,planted_total:0,results:[{...fixture().results[0],item_id:'A-02',label:'First request',decision:'retain',match:true},{...fixture().results[1],item_id:'A-10',label:'Duplicate request',decision:{type:'merge',target_record_id:'A-02'},match:true}]});
 const valid=inspectRunResponse(value,uploaded,steps);assert.equal(valid.kind,'complete');assert.deepEqual(valid.attempt.results[1].decision,{type:'merge',target_record_id:'A-02'});
 for(const target of ['A-10','a-02','missing']){const invalid=structuredClone(value);invalid.results[1].decision.target_record_id=target;assert.equal(inspectRunResponse(invalid,uploaded,steps).kind,'incomplete');}
});

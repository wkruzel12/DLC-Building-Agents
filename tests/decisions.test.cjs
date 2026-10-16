const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {caseSchema}=require('../src/lib/case-schema.ts');
const {decisionParts,formatDecision,sameDecision,flagOutputSchema}=require('../src/lib/decisions.ts');
const {runAll,score}=require('../src/lib/runner.ts');
const {publicScenario}=require('../src/lib/scenario.ts');
const {normalizePdfDecisions,validatePdfCase}=require('../src/lib/pdf-case-validation.ts');
const {performanceSummary}=require('../src/lib/stakeholder-context.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
const steps={extract:'Extract actual source evidence.',check:'Compare the records and check criteria.',flag:'Use the case actions and target IDs.'};
function fixture(){return caseSchema.parse({...sample,id:'workflow',decisions:['approve','merge','escalate'],items:['A-01','A-02','A-10'].map(id=>({id,label:id,text:'Public evidence for '+id})),answer_key:['A-01','A-02','A-10'].map((id,index)=>({item_id:id,decision:index===2?{type:'merge',target_record_id:'A-02'}:'approve',planted:index===2,note:'PRIVATE_TARGET_EXPLANATION'}))});}

test('dynamic case actions support legacy cases, structured merges, and additional business workflows',()=>{
 assert.ok(caseSchema.safeParse(sample).success);
 const value=fixture();assert.deepEqual(value.decisions,['approve','merge','escalate']);
 assert.deepEqual(value.answer_key[2].decision,{type:'merge',target_record_id:'A-02'});
 const visible=publicScenario(value);assert.equal(visible.answer_key,undefined);assert.ok(!JSON.stringify(visible).includes('PRIVATE_TARGET_EXPLANATION'));
 const forwarded={...value,decisions:['approve','forward'],decision_rules:{forward:{requires_target:true}},answer_key:value.answer_key.map(entry=>entry.item_id==='A-10'?{...entry,decision:{type:'forward',target_record_id:'A-02'}}:entry)};
 assert.ok(caseSchema.safeParse(forwarded).success);
 assert.equal(flagOutputSchema(forwarded,'A-10').properties.decision.anyOf[1].properties.target_record_id.enum.includes('A-02'),true);
});

test('case validation rejects nonexistent, self, missing, and forbidden targets and undeclared actions',()=>{
 const value=fixture();
 for(const invalid of [
  {type:'merge',target_record_id:'missing'},
  {type:'merge',target_record_id:'A-10'},
  {type:'merge',target_record_id:null},'merge',
  {type:'approve',target_record_id:'A-02'},
  {type:'invented',target_record_id:null},
  {type:'merge',target_record_id:'A-02',extra:'untrusted'}
 ])assert.equal(caseSchema.safeParse({...value,answer_key:value.answer_key.map(entry=>entry.item_id==='A-10'?{...entry,decision:invalid}:entry)}).success,false,JSON.stringify(invalid));
 assert.equal(caseSchema.safeParse({...value,decision_rules:{merge:{requires_target:false}}}).success,false);
 assert.equal(caseSchema.safeParse({...value,decision_rules:{unknown:{requires_target:true}}}).success,false);
 assert.equal(caseSchema.safeParse({...value,decisions:[...value.decisions,'error']}).success,false);
});

test('merge equality compares action AND exact target; display supports new and saved legacy decisions',()=>{
 const expected={type:'merge',target_record_id:'A-02'};
 assert.equal(sameDecision(expected,{type:'merge',target_record_id:'A-02'}),true);
 assert.equal(sameDecision(expected,{type:'merge',target_record_id:'A-01'}),false);
 assert.equal(sameDecision(expected,{type:'approve',target_record_id:'A-02'}),false);
 assert.equal(sameDecision(expected,'merge'),false);
 assert.equal(sameDecision('advance',{type:'advance',target_record_id:null}),true);
 assert.equal(formatDecision(expected),'Merge into A-02');
 assert.equal(formatDecision('advance'),'Advance');assert.equal(formatDecision('human_review'),'Human review');
 assert.equal(formatDecision('approve_payment'),'Approve payment');
 assert.equal(formatDecision('error'),'Execution error');
});

test('scoring recomputes target correctness rather than trusting cached match flags',()=>{
 const value=fixture();
 const results=value.answer_key.map(entry=>({item_id:entry.item_id,decision:entry.decision,match:true}));
 results[2].decision={type:'merge',target_record_id:'A-01'};
 assert.deepEqual(score(value,results),{accuracy:67,planted_caught:0,planted_total:1,errors:0});
});

test('single-record cases never generate an invalid empty target enum',()=>{
 const value={decisions:['approve','merge'],items:[{id:'only'}]};
 const branches=flagOutputSchema(value,'only').properties.decision.anyOf;
 assert.deepEqual(branches.map(branch=>branch.properties.type.enum[0]),['approve']);
});

test('saved structured targets survive serialization and remain readable in stakeholder summaries',()=>{
 const value=fixture();
 const results=value.answer_key.map(entry=>({item_id:entry.item_id,label:entry.item_id,decision:entry.decision,expected_decision:entry.decision,match:true,reason:'Public evidence.',outputs:{extract:'Evidence',check:'Compared',flag:'Structured'}}));
 const attempt=JSON.parse(JSON.stringify({id:'attempt',attempt_number:1,mode:'openai',steps,results,accuracy:100,planted_caught:1,planted_total:1,errors:0}));
 assert.deepEqual(attempt.results[2].decision,{type:'merge',target_record_id:'A-02'});
 const summary=performanceSummary(value,attempt);
 assert.equal(summary.decision_counts.merge,1);
 assert.equal(summary.decisions[2].decision,'Merge into A-02');
 assert.equal(summary.decisions[2].decision,'Merge into A-02');assert.equal(summary.decisions[2].correct_decision,undefined);
 assert.ok(!JSON.stringify(summary).includes('PRIVATE_TARGET_EXPLANATION'));
});

test('PDF normalization preserves new actions and exact merge targets without inventing missing answers',()=>{
 const value=fixture();
 const draft=normalizePdfDecisions({...value,decisions:['Approve','Merge into a duplicate record','Escalate'],decision_rules:[{type:'Merge',requires_target:true}],answer_key:value.answer_key.map(entry=>({...entry,decision:entry.item_id==='A-10'?'Merge into A-02':'Approve'}))});
 assert.deepEqual(validatePdfCase(draft).answer_key[2].decision,{type:'merge',target_record_id:'A-02'});
 const empty=normalizePdfDecisions({...value,answer_key:[]});
 assert.throws(()=>validatePdfCase(empty),error=>error.code==='grading_setup_required');
 const custom=normalizePdfDecisions({decisions:['Proceed','Decline','Manual review','Approve payment'],answer_key:[]});
 assert.deepEqual(custom.decisions,['proceed','decline','manual_review','approve_payment']);
});

test('live-run contract is case-specific, target-aware, private, bounded, and scored by action plus target',async t=>{
 const oldFetch=global.fetch,oldEnv={...process.env};t.after(()=>{global.fetch=oldFetch;process.env=oldEnv;});
 process.env.DEMO_MODE='false';process.env.OPENAI_API_KEY='test-key';
 const value=fixture();let selected={type:'merge',target_record_id:'A-02'},calls=0;
 global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);calls++;
  assert.equal(body.store,false);assert.ok(body.max_output_tokens<=650);
  assert.ok(!options.body.includes('PRIVATE_TARGET_EXPLANATION'));assert.ok(!options.body.includes('answer_key'));
  let text='Extracted evidence';
  if(body.instructions.includes('stage 2')){assert.match(body.input,/REFERENCE RECORDS/);assert.ok(body.input.includes('A-02'));text='Checked evidence';}
  if(body.instructions.includes('stage 3')){
   const branches=body.text.format.schema.properties.decision.anyOf;
   assert.deepEqual(branches.map(branch=>branch.properties.type.enum[0]),value.decisions);
   const id=body.instructions.match(/CURRENT RECORD ID: ([^\n]+)/)[1];
   const targets=branches.find(branch=>branch.properties.type.enum[0]==='merge').properties.target_record_id.enum;
   assert.ok(!targets.includes(id));assert.ok(targets.every(target=>value.items.some(item=>item.id===target)));
   text=JSON.stringify({decision:id==='A-10'?selected:{type:'approve',target_record_id:null},reason:'Public evidence only.'});
  }
  return new Response(JSON.stringify({id:'test',status:'completed',output_text:text,output:[]}),{headers:{'Content-Type':'application/json'}});
 };
 let results=await runAll(value,steps);assert.equal(calls,9);assert.deepEqual(score(value,results),{accuracy:100,planted_caught:1,planted_total:1,errors:0});
 selected={type:'merge',target_record_id:'A-01'};results=await runAll(value,steps);assert.equal(results[2].match,false);assert.equal(score(value,results).accuracy,67);
 for(const decision of [{type:'merge',target_record_id:'A-10'},{type:'merge',target_record_id:'missing'},{type:'merge',target_record_id:null},{type:'invented',target_record_id:null},'merge']){
  selected=decision;results=await runAll(value,steps);assert.equal(results[2].decision,'error');assert.equal(results[2].match,false);
 }
 selected={type:'approve',target_record_id:null};results=await runAll(value,steps);assert.equal(results[2].match,false);assert.equal(results[2].decision,'approve');
 process.env.DEMO_MODE='true';global.fetch=async()=>{throw Error('Demo must not call OpenAI');};
 results=await runAll(value,steps);assert.equal(decisionParts(results[2].decision).target_record_id,'A-02');assert.equal(score(value,results).accuracy,100);
});

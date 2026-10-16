const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {caseFromPdf,extractPdfCase,PDF_EXTRACTION_INSTRUCTIONS}=require('../src/lib/pdf-case.ts');
const {publicScenario}=require('../src/lib/scenario.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
const bytes=Buffer.from('%PDF-1.7\nTest fixture');
function configure(t,fetch){const oldFetch=global.fetch,oldEnv={...process.env};t.after(()=>{global.fetch=oldFetch;process.env=oldEnv;});global.fetch=fetch;process.env.OPENAI_API_KEY='test-key';process.env.OPENAI_MODEL='gpt-5.4-nano';}
function converted(value){return new Response(JSON.stringify({id:'pdf-test',status:'completed',output_text:JSON.stringify(value),output:[]}),{headers:{'Content-Type':'application/json'}});}

test('PDF conversion stays server-side and produces a validated, redacted case',async t=>{
 let calls=0;
 configure(t,async(url,options)=>{
  calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,10000);
  assert.equal(body.input[0].content[0].type,'input_file');
  assert.equal(body.input[0].content[0].file_data,'data:application/pdf;base64,'+bytes.toString('base64'));
  assert.ok(body.instructions.includes('Never infer, solve, or invent'));
  return converted(sample);
 });
 const scenario=await caseFromPdf(bytes);assert.equal(calls,1);assert.equal(scenario.items.length,5);
 const publicCase=publicScenario(scenario);assert.equal(publicCase.answer_key,undefined);assert.equal(publicCase.rubric,undefined);
 assert.ok(!JSON.stringify(publicCase).includes(sample.answer_key[0].note));
});

test('rejects wrong signatures, excessive size, and missing API keys before conversion',async t=>{
 configure(t,async()=>{throw Error('Must not call the API');});
 await assert.rejects(caseFromPdf(Buffer.from('not a PDF')),error=>error.status===400);
 await assert.rejects(caseFromPdf(Buffer.alloc(1024*1024+1)),error=>error.status===413);
 delete process.env.OPENAI_API_KEY;
 await assert.rejects(caseFromPdf(bytes),error=>error.status===503&&error.message.includes('OPENAI_API_KEY'));
});

test('missing or incomplete PDF grading data is rejected',async t=>{
 configure(t,async()=>converted({...sample,answer_key:[]}));
 await assert.rejects(caseFromPdf(bytes),error=>error.status===422&&error.phase==='validation'&&error.code==='grading_setup_required');
 global.fetch=async()=>converted({...sample,answer_key:sample.answer_key.slice(1)});
 await assert.rejects(caseFromPdf(bytes),error=>error.status===422);
});

test('schema diagnostics distinguish missing context from extraction failures without exposing values',async t=>{
 configure(t,async()=>converted({...sample,story:'',answer_key:[]}));
 await assert.rejects(caseFromPdf(bytes),error=>{
  assert.equal(error.phase,'validation');assert.equal(error.code,'case_schema_invalid');
  assert.ok(error.issues.some(issue=>issue.includes('context/background')));
  assert.ok(error.issues.some(issue=>issue.includes('private grading key')));
  assert.ok(!JSON.stringify(error.issues).includes(sample.answer_key[0].note));return true;
 });
 global.fetch=async()=>new Response(JSON.stringify({status:'incomplete',output_text:'',output:[]}),{headers:{'Content-Type':'application/json'}});
 await assert.rejects(caseFromPdf(bytes),error=>error.phase==='extraction'&&error.code==='pdf_extraction_incomplete');
 global.fetch=async()=>new Response(JSON.stringify({status:'completed',output_text:'not JSON',output:[]}),{headers:{'Content-Type':'application/json'}});
 await assert.rejects(caseFromPdf(bytes),error=>error.phase==='extraction'&&error.code==='pdf_extraction_invalid_json');
});

test('private setup preserves partial grades without making an incomplete case runnable',async t=>{
 const partial={...sample,answer_key:sample.answer_key.slice(1)};
 configure(t,async()=>converted(partial));
 assert.deepEqual(await extractPdfCase(bytes),partial);
 await assert.rejects(caseFromPdf(bytes),error=>error.code==='grading_setup_required');
});

test('flexible extraction contract accepts explicit embedded grades but forbids grading inference and truncation',async t=>{
 assert.match(PDF_EXTRACTION_INSTRUCTIONS,/not exact heading names/);
 assert.match(PDF_EXTRACTION_INSTRUCTIONS,/per-record grading annotation/);
 assert.match(PDF_EXTRACTION_INSTRUCTIONS,/Never infer, solve, or invent/);
 assert.match(PDF_EXTRACTION_INSTRUCTIONS,/do not truncate/);
 const value={...sample,id:'table-case',items:[{id:'Supplier A',label:'Supplier A',text:'Certification documented.'}],answer_key:[{item_id:'Supplier A',decision:'advance',planted:false,note:'Instructor-only explanation.'}]};
 configure(t,async()=>converted(value));
 const result=await caseFromPdf(bytes);
 assert.equal(result.answer_key[0].item_id,'Supplier A');
 assert.ok(!JSON.stringify(publicScenario(result)).includes('Instructor-only explanation.'));
});

test('PDF validation still rejects duplicate IDs, unknown grades, excessive records, and conflicting keys',async t=>{
 configure(t,async()=>converted(sample));
 for(const value of [
  {...sample,items:[sample.items[0],sample.items[0]]},
  {...sample,answer_key:[...sample.answer_key,{...sample.answer_key[0],decision:'reject'}]},
  {...sample,answer_key:[{...sample.answer_key[0],decision:'hire'}]},
  {...sample,items:Array.from({length:21},(_,i)=>({...sample.items[0],id:String(i)}))}
 ]){
  global.fetch=async()=>converted(value);
  await assert.rejects(caseFromPdf(bytes),error=>error.phase==='validation');
 }
});

test('PDF API failures are sanitized and not retried',async t=>{
 let calls=0;
 configure(t,async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_MESSAGE',code:'rate_limit_exceeded'}}),{status:429,headers:{'Content-Type':'application/json'}});});
 await assert.rejects(caseFromPdf(bytes),error=>error.status===429&&!error.message.includes('PRIVATE_PROVIDER_MESSAGE'));
 assert.equal(calls,1);
});

test('PDF merge outcomes retain their explicit targets and never become a different grade',async t=>{
 const target=sample.items[1].id;
 const value={...sample,decisions:[...sample.decisions,'Merge'],answer_key:sample.answer_key.map((entry,index)=>index?entry:{...entry,decision:'Merge into '+target})};
 configure(t,async(url,options)=>{
  const body=JSON.parse(options.body),format=body.text.format.schema;
  assert.equal(format.properties.decisions.items.enum,undefined);
  assert.equal(format.properties.answer_key.items.properties.decision.enum,undefined);
  assert.match(body.instructions,/Merge into another record is NOT reject/);
  return converted(value);
 });
 const draft=await extractPdfCase(bytes);
 assert.deepEqual(draft.answer_key[0].decision,{type:'merge',target_record_id:target});
 assert.deepEqual((await caseFromPdf(bytes)).answer_key[0].decision,{type:'merge',target_record_id:target});
 global.fetch=async()=>converted({...value,answer_key:value.answer_key.map((entry,index)=>index?entry:{...entry,decision:'Merge'})});
 await assert.rejects(caseFromPdf(bytes),error=>error.phase==='validation'&&error.code==='grading_setup_required');
});

test('PDF source capitalization and spacing normalize without changing the grading meaning',async t=>{
 const value={...sample,decisions:[' Advance ','Reject','Human review'],answer_key:sample.answer_key.map(entry=>({...entry,decision:{advance:'Advance',reject:'Reject',human_review:'Human review'}[entry.decision]}))};
 configure(t,async()=>converted(value));
 const result=await caseFromPdf(bytes);
 assert.deepEqual(result.decisions,['advance','reject','human_review']);
 assert.deepEqual(result.answer_key,sample.answer_key);
 global.fetch=async()=>converted({...value,answer_key:[{...value.answer_key[0],decision:'Hold'}]});
 await assert.rejects(caseFromPdf(bytes),error=>error.code==='grading_setup_required');
});

test('PDF grading annotations cannot be published inside otherwise valid public fields',async t=>{
 configure(t,async()=>converted(sample));
 for(const field of ['story','task','requirements']){
  global.fetch=async()=>converted({...sample,[field]:sample[field]+'\nExpected totals (instructor-provided): PRIVATE_GRADING_MAPPING'});
  await assert.rejects(caseFromPdf(bytes),error=>error.phase==='extraction'&&error.code==='pdf_grading_redaction_failed'&&!error.message.includes('PRIVATE_GRADING_MAPPING'));
 }
 global.fetch=async()=>converted({...sample,items:sample.items.map((item,index)=>index?item:{...item,text:item.text+'\nGrading decision: advance'})});
 await assert.rejects(caseFromPdf(bytes),error=>error.code==='pdf_grading_redaction_failed');
});

test('PDF stakeholder IDs are independent of case-sensitive record and merge IDs',async t=>{
 const value={...sample,decisions:['advance','merge'],items:[{id:'A-02',label:'Record A-02',text:'Original source record.'},{id:'A-10',label:'Record A-10',text:'Duplicate submission evidence.'}],answer_key:[{item_id:'A-02',decision:{type:'advance',target_record_id:null},planted:false,note:'Private grading explanation.'},{item_id:'A-10',decision:{type:'merge',target_record_id:'A-02'},planted:true,note:'Private merge explanation.'}],stakeholders:[{id:'sarah_mitchell',name:'Sarah Mitchell',role:'Recruiter'},{id:'zack_johnson',name:'Zack Johnson',role:'Director of HR'}]};
 configure(t,async()=>converted(value));
 const result=await caseFromPdf(bytes);
 assert.deepEqual(result.items.map(item=>item.id),['A-02','A-10']);
 assert.deepEqual(result.answer_key[1].decision,{type:'merge',target_record_id:'A-02'});
 assert.equal(result.stakeholders.source,'case_file');assert.equal(result.stakeholders.status,'approved');
 assert.equal(publicScenario(result).stakeholders,undefined);assert.equal(publicScenario(result).answer_key,undefined);
});

test('private instructor setup validates JSON offline and does not print private answer notes',t=>{
 const {spawnSync}=require('node:child_process');
 const {tmpdir}=require('node:os');const path=require('node:path');
 const directory=fs.mkdtempSync(path.join(tmpdir(),'agent-lab-setup-test-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const filename=path.join(directory,'case.json');
 fs.writeFileSync(filename,JSON.stringify(sample));
 const run=()=>spawnSync(process.execPath,['--conditions=react-server','scripts/setup-pdf-case.cjs','validate',filename],{encoding:'utf8'});
 const valid=run();assert.equal(valid.status,0,valid.stderr);assert.ok(!valid.stdout.includes(sample.answer_key[0].note));
 fs.writeFileSync(filename,JSON.stringify({...sample,answer_key:[]}));
 const invalid=run();assert.equal(invalid.status,1);assert.match(invalid.stderr,/instructor/);assert.ok(!invalid.stderr.includes(sample.answer_key[0].note));
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {caseFromPdf}=require('../src/lib/pdf-case.ts');
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
 await assert.rejects(caseFromPdf(bytes),error=>error.status===422&&error.message.includes('explicit grading'));
 global.fetch=async()=>converted({...sample,answer_key:sample.answer_key.slice(1)});
 await assert.rejects(caseFromPdf(bytes),error=>error.status===422);
});

test('PDF API failures are sanitized and not retried',async t=>{
 let calls=0;
 configure(t,async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_MESSAGE',code:'rate_limit_exceeded'}}),{status:429,headers:{'Content-Type':'application/json'}});});
 await assert.rejects(caseFromPdf(bytes),error=>error.status===429&&!error.message.includes('PRIVATE_PROVIDER_MESSAGE'));
 assert.equal(calls,1);
});

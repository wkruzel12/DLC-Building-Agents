const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {walkthroughRequest}=require('../src/lib/walkthrough.ts');
const {emptySetup}=require('../src/lib/case-builder.ts');
const {freshProgress}=require('../src/lib/builder-progress.ts');
const {prepareAgentTests,inspectRunResponse}=require('../src/lib/combined-builder.ts');

test('professor publishes a fictional case, student joins and runs it, and the dashboard counts the result',async()=>{
 const saved=new Map();
 global.window={location:{origin:'https://example.test'}};
 Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}});
 const professor=walkthroughRequest('professor',80),student=walkthroughRequest('student',80);
 const post=async(request,path,body)=>{
  const response=await request(path,{method:'POST',body:JSON.stringify(body)});
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  return result;
 };
 assert.equal((await student('/api/instructor/cases')).status,403);
 const setup=emptySetup();
 const draft=await post(professor,'/api/instructor/builder/generate',{setup});
 const published=await post(professor,'/api/instructor/cases',{setup,edit:draft.case,reviewed:true});
 const joined=await post(student,'/api/cases/join',{code:published.join_code});
 assert.equal(joined.case_id,published.case_id);
 assert.equal(joined.scenario.answer_key,undefined);
 const steps={extract:'Find the stated evidence.',check:'Compare with each requirement.',flag:'Send uncertain cases to a human.'};
 await prepareAgentTests({caseId:joined.case_id,scenario:joined.scenario,steps,progress:{...freshProgress(),record_id:joined.scenario.items[0].id},request:student,onProgress:()=>{}});
 const run=await post(student,'/api/run',{case_id:joined.case_id,steps});
 assert.equal(inspectRunResponse(run,joined.scenario,steps).kind,'complete');
 const dashboard=await (await professor('/api/instructor/dashboard?case_id='+joined.case_id)).json();
 assert.equal(dashboard.summary.enrolled,1);
 assert.equal(dashboard.summary.runs,1);
});

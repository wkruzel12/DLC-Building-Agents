const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

// Run the existing server TypeScript with Node, without another test dependency.
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {runAll,score}=require('../src/lib/runner.ts');
const {openaiFailure}=require('../src/lib/openai-errors.ts');
const {localDemoEnabled}=require('../src/lib/local-demo.ts');
const OpenAI=require('openai').default;
const scenario={id:'test',requirements:'Test requirements',decisions:['advance','reject','human_review'],items:Array.from({length:5},(_,i)=>({id:`r${i}`,label:`Applicant ${i}`,text:`Fictional resume ${i}`})),answer_key:Array.from({length:5},(_,i)=>({item_id:`r${i}`,decision:'advance',planted:i<2,note:'PRIVATE_ANSWER_NOTE'}))};
const steps={extract:'Extract relevant evidence.',check:'Check all job requirements.',flag:'Choose one valid decision.'};

function configure(t,fetch){
 const previousFetch=global.fetch;
 const previousEnv={...process.env};
 global.fetch=fetch;
 process.env.DEMO_MODE='false';process.env.OPENAI_MODEL='gpt-5.4-nano';process.env.OPENAI_API_KEY='test-key';
 t.after(()=>{global.fetch=previousFetch;process.env=previousEnv;});
}
function response(text,status='completed'){
 return new Response(JSON.stringify({id:'response-test',status,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]}),{headers:{'Content-Type':'application/json'}});
}

test('five resumes use sequential stages, bounded concurrency, token caps, and server scoring',async t=>{
 let calls=0,inFlight=0,maximum=0;
 configure(t,async(_url,options)=>{
  const body=JSON.parse(options.body);calls++;inFlight++;maximum=Math.max(maximum,inFlight);
  assert.equal(body.model,'gpt-5.4-nano');assert.equal(body.store,false);
  assert.ok(body.max_output_tokens<=650);assert.ok(!options.body.includes('PRIVATE_ANSWER_NOTE'));
  await new Promise(resolve=>setTimeout(resolve,3));inFlight--;
  if(body.instructions.includes('stage 1')){assert.ok(body.input.startsWith('RECORD:'));return response('EXTRACTED_EVIDENCE');}
  if(body.instructions.includes('stage 2')){assert.ok(body.input.includes('EXTRACTION:\nEXTRACTED_EVIDENCE'));return response('CHECKED_EVIDENCE');}
  assert.equal(body.input,'CHECK OUTPUT:\nCHECKED_EVIDENCE');
  assert.deepEqual(body.text.format.schema.properties.decision.anyOf.map(branch=>branch.properties.type.enum[0]),['advance','reject','human_review']);
  return response(JSON.stringify({decision:{type:'advance',target_record_id:null},reason:'Meets the test requirements.'}));
 });
 const results=await runAll(scenario,steps);
 assert.equal(calls,15);assert.equal(maximum,2);assert.equal(results.length,5);
 assert.ok(results.every(item=>item.match&&item.outputs.extract&&item.outputs.check&&item.outputs.flag));
 assert.deepEqual(score(scenario,results),{planted_caught:2,planted_total:2,accuracy:100,errors:0});
});

test('invalid decisions and incomplete outputs become scored errors',async t=>{
 configure(t,async(_url,options)=>{
  const body=JSON.parse(options.body);
  return response(body.instructions.includes('stage 3')?'{"decision":{"type":"invented","target_record_id":null},"reason":"Invalid"}':'Stage evidence');
 });
 const results=await runAll(scenario,steps);
 assert.ok(results.every(item=>item.decision==='error'&&item.error.includes('invalid decision')));
 assert.equal(score(scenario,results).errors,5);
 global.fetch=async()=>response('', 'incomplete');
 assert.ok((await runAll(scenario,steps)).every(item=>item.error.includes('token limit')));
});

test('invalid models stop further scheduling and sanitize provider errors',async t=>{
 let calls=0;
 configure(t,async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_ERROR',code:'model_not_found'}}),{status:404,headers:{'Content-Type':'application/json'}});});
 await assert.rejects(runAll(scenario,steps),error=>error.message.includes('model is unavailable')&&!error.message.includes('PRIVATE_PROVIDER_ERROR'));
 assert.ok(calls<=2);
});

test('rate limits, quota, authentication, and service failures have safe messages',()=>{
 for(const [status,code,expected] of [[429,'rate_limit_exceeded','rate limit'],[429,'insufficient_quota','budget'],[401,'invalid_api_key','server API key'],[403,'permission_denied','permission'],[500,'server_error','retry later']]){
  const failure=openaiFailure(new OpenAI.APIError(status,{code,message:'SECRET_PROVIDER_DETAILS'},undefined,undefined));
  assert.ok(failure.message.includes(expected));assert.ok(!failure.message.includes('SECRET_PROVIDER_DETAILS'));
 }
});

test('demo mode performs no OpenAI requests',async t=>{
 configure(t,async()=>{throw Error('Demo must not call OpenAI');});
 process.env.DEMO_MODE='true';
 assert.equal((await runAll(scenario,steps)).length,5);
});

test('production cannot enable the development bypass through demo configuration',t=>{
 const previousEnv={...process.env};t.after(()=>{process.env=previousEnv;});
 process.env.NODE_ENV='production';process.env.DEMO_MODE='true';
 assert.equal(localDemoEnabled(),false);
 process.env.NODE_ENV='development';process.env.DEMO_MODE='false';
 assert.equal(localDemoEnabled(),true);
});

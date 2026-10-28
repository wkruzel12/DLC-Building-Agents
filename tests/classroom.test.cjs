const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {instructorEmails,classroomMode,isInstructor,normalizeJoinCode,formatJoinCode,JOIN_CODE_ALPHABET}=require('../src/lib/roles.ts');
const {classSummary}=require('../src/lib/class-analytics.ts');
const {generateJoinCode,savePublishedCase,joinCase,readEnrolledCase,classAttempts,listPublishedCases}=require('../src/lib/classroom-store.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
const CASE='12345678-1234-4123-8123-123456789012';
const verified=email=>({id:'u1',email,email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false});

test('classroom mode is off unless instructor emails are configured',()=>{
 assert.equal(classroomMode(''),false);assert.equal(classroomMode(undefined),false);
 assert.equal(classroomMode('prof@tcu.edu'),true);
 assert.deepEqual([...instructorEmails(' Prof@TCU.edu, dean@tcu.edu\nta@tcu.edu ')],['prof@tcu.edu','dean@tcu.edu','ta@tcu.edu']);
});

test('only verified, non-anonymous listed accounts are instructors',()=>{
 const list='prof@tcu.edu';
 assert.equal(isInstructor(verified('PROF@tcu.edu'),list),true);
 assert.equal(isInstructor(verified('student@tcu.edu'),list),false);
 assert.equal(isInstructor({...verified('prof@tcu.edu'),email_confirmed_at:null},list),false);
 assert.equal(isInstructor({...verified('prof@tcu.edu'),is_anonymous:true},list),false);
 assert.equal(isInstructor({id:'a',is_anonymous:true,user_metadata:{demo_email_label:'prof@tcu.edu'}},list),false);
 assert.equal(isInstructor(null,list),false);
 assert.equal(isInstructor(verified('prof@tcu.edu'),''),false);
});

test('join codes are generated, normalized, and formatted consistently',()=>{
 for(let i=0;i<50;i++){const code=generateJoinCode();assert.equal(code.length,8);assert.ok([...code].every(letter=>JOIN_CODE_ALPHABET.includes(letter)));assert.equal(normalizeJoinCode(formatJoinCode(code).toLowerCase()),code);}
 assert.equal(normalizeJoinCode(' abcd-2345 '),'ABCD2345');
 for(const bad of ['','ABC','ABCD23450','ABCD-O0I1','ABCD 23!5'])assert.equal(normalizeJoinCode(bad),null,bad);
 assert.ok(!/[01ILO]/.test(JOIN_CODE_ALPHABET));
});

const row=(user,n,minute,accuracy,decisions)=>({user_id:user,attempt_number:n,created_at:`2026-10-20T10:${String(minute).padStart(2,'0')}:00Z`,accuracy,planted_caught:0,planted_total:2,errors:0,results:Object.entries(decisions).map(([item_id,decision])=>({item_id,decision,match:false}))});
const key=Object.fromEntries(sample.answer_key.map(entry=>[entry.item_id,entry.decision]));

test('class summary uses each student latest run and ranks the most-missed records first',()=>{
 const rows=[
  row('a',1,0,40,{...key,r02:'reject',r04:'reject'}),
  row('a',2,5,100,key),                                   // student a improved: latest is perfect
  row('b',1,1,60,{...key,r02:'reject',r04:'advance'}),
  row('c',1,2,80,{...key,r04:'reject'}),
  row('c',2,3,60,{...key,r04:'error',r01:'reject'})       // c got worse: latest counts
 ];
 const summary=classSummary(sample,rows,80,5);
 assert.equal(summary.enrolled,5);assert.equal(summary.students,3);assert.equal(summary.runs,5);assert.equal(summary.runs_per_student,1.7);
 assert.equal(summary.average_latest_accuracy,73);       // (100+60+60)/3
 assert.equal(summary.average_best_accuracy,80);         // (100+60+80)/3
 assert.equal(summary.highest_accuracy,100);
 assert.equal(summary.at_target,2);                      // a (100) and c (best 80)
 const [first,second]=summary.toughest;
 assert.equal(first.item_id,'r04');assert.equal(first.missed,2);assert.equal(first.attempted,3);assert.equal(first.miss_rate,67);assert.equal(first.planted,true);
 assert.ok(['Advance','Execution error'].includes(first.common_wrong));assert.equal(first.common_wrong_count,1);
 assert.equal(summary.toughest.find(r=>r.item_id==='r02').missed,1);
 assert.ok(second.miss_rate<=first.miss_rate);
 assert.equal(summary.toughest.find(r=>r.item_id==='r05').missed,0);
 assert.equal(summary.toughest.length,sample.items.length);
});

test('empty classes produce a safe summary',()=>{
 const summary=classSummary(sample,[],80,4);
 assert.equal(summary.students,0);assert.equal(summary.enrolled,4);assert.equal(summary.average_latest_accuracy,null);assert.equal(summary.highest_accuracy,null);assert.equal(summary.at_target,0);
 assert.ok(summary.toughest.every(r=>r.attempted===0&&r.miss_rate===0&&r.common_wrong===null));
});

function mockSupabase(t,handler){
 const oldFetch=global.fetch,oldEnv={...process.env},calls=[];
 t.after(()=>{global.fetch=oldFetch;process.env=oldEnv;});
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
 global.fetch=async(url,init={})=>{const request=new URL(url);const call={table:request.pathname.split('/').pop(),method:init.method||'GET',params:request.searchParams,body:init.body?JSON.parse(init.body):undefined,headers:new Headers(init.headers)};calls.push(call);const [status,value,headers={}]=handler(call);return new Response(value===undefined?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});};
 return calls;
}

test('published cases retry on a join-code collision and store the owner',async t=>{
 let inserts=0;
 const calls=mockSupabase(t,call=>{inserts++;assert.equal(call.method,'POST');assert.equal(call.body.owner_id,'prof');return inserts===1?[409,{code:'23505',message:'duplicate key'}]:[201,{id:CASE,join_code:call.body.join_code}];});
 const saved=await savePublishedCase('prof',sample);
 assert.equal(saved.id,CASE);assert.equal(normalizeJoinCode(saved.joinCode),saved.joinCode);assert.equal(calls.length,2);
});

test('enrolled-case reads require an enrollment for that exact student and case',async t=>{
 const calls=mockSupabase(t,call=>{
  if(call.table==='case_enrollments'){assert.equal(call.params.get('case_id'),'eq.'+CASE);return [200,call.params.get('user_id')==='eq.student'?[{case_id:CASE}]:[]];}
  assert.equal(call.params.get('id'),'eq.'+CASE);assert.equal(call.params.get('join_code'),'not.is.null');return [200,[{scenario:sample}]];
 });
 assert.equal((await readEnrolledCase(CASE,'student')).title,sample.title);
 assert.equal(await readEnrolledCase(CASE,'stranger'),null);
 assert.equal(calls.filter(call=>call.table==='private_cases').length,1); // stranger never reads the case
});

test('joining by code enrolls the student without granting other access',async t=>{
 const calls=mockSupabase(t,call=>{
  if(call.table==='private_cases'){assert.equal(call.params.get('join_code'),'eq.ABCD2345');return [200,[{id:CASE,scenario:sample}]];}
  assert.equal(call.method,'POST');assert.deepEqual(call.body,{case_id:CASE,user_id:'student'});assert.match(call.headers.get('prefer'),/ignore-duplicates/);return [201,undefined];
 });
 const joined=await joinCase('ABCD2345','student');
 assert.equal(joined.id,CASE);assert.equal(joined.scenario.title,sample.title);assert.equal(calls.length,2);
});

test('unknown join codes enroll nobody',async t=>{
 const calls=mockSupabase(t,()=>[200,[]]);
 assert.equal(await joinCase('ZZZZ9999','student'),null);assert.equal(calls.length,1);
});

test('class attempts are only loaded for the case owner',async t=>{
 const calls=mockSupabase(t,call=>{
  if(call.table==='private_cases')return [200,call.params.get('owner_id')==='eq.prof'?[{scenario:sample}]:[]];
  if(call.table==='attempts'){assert.equal(call.params.get('scenario_id'),'eq.'+CASE);return [200,[row('s1',1,0,80,key)]];}
  return [200,[],{'Content-Range':'0-0/3'}];
 });
 const data=await classAttempts(CASE,'prof');
 assert.equal(data.rows.length,1);assert.equal(data.enrolled,3);assert.equal(data.scenario.title,sample.title);
 const before=calls.length;
 assert.equal(await classAttempts(CASE,'other-instructor'),null);
 assert.equal(calls.slice(before).some(call=>call.table==='attempts'),false);
});

test('case lists return display fields only, never the answer key',async t=>{
 mockSupabase(t,call=>{
  if(call.table==='private_cases'){assert.equal(call.params.get('owner_id'),'eq.prof');return [200,[{id:CASE,join_code:'ABCD2345',created_at:'2026-10-20T10:00:00Z',scenario:sample}]];}
  return [200,[{case_id:CASE},{case_id:CASE}]];
 });
 const list=await listPublishedCases('prof');
 assert.deepEqual(list,[{case_id:CASE,join_code:'ABCD2345',created_at:'2026-10-20T10:00:00Z',title:sample.title,records:5,enrolled:2}]);
 assert.ok(!JSON.stringify(list).includes('answer_key'));
});

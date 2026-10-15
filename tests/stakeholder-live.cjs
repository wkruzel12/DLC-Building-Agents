// Optional paid HTTP smoke test. Requires the running local development app.
// Uses a fresh cookie jar, synthetic sample data, one agent run, and five chat/reflection calls.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const base=process.env.LAB_TEST_URL||'http://localhost:3001';
let cookie='';
async function request(path,body,expected=200,useCookie=true){
 const headers={origin:base};if(useCookie&&cookie)headers.cookie=cookie;if(body)headers['Content-Type']='application/json';
 const response=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(125000)});
 const text=await response.text();let result;try{result=JSON.parse(text);}catch{throw Error('Non-JSON response '+response.status+' from '+path);}
 assert.equal(response.status,expected,result.error||path);
 if(useCookie&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 return result;
}
async function main(){
 await request('/api/stakeholders/chat?scenario_id=resume-screener',undefined,409,false);
 const attempt=await request('/api/local-demo',{case_id:'resume-screener',steps:{extract:'Extract education, Excel and SQL experience, work experience, and communication evidence. Consider equivalent experience without assuming missing facts.',check:'Compare extracted evidence to each criterion. Consider equivalent professional experience and identify unverifiable skills.',flag:'Advance qualified records, reject clear mismatches, and route ambiguous or incomplete evidence to human_review. Explain briefly.'}});
 assert.equal(attempt.results.length,5);assert.equal(attempt.errors,0);assert.ok(cookie);
 console.log('Live sample agent run completed and stored trusted review context.');
 const endpoint='/api/stakeholders/chat?scenario_id=resume-screener&attempt_id='+attempt.id;
 let review=await request(endpoint);
 assert.equal(review.attempt.accuracy,attempt.accuracy);assert.equal(review.attempt.sample_size,5);
 const body=(id,action,extra={})=>({scenario_id:'resume-screener',attempt_id:attempt.id,stakeholder_id:id,conversation_id:review.conversations[id].id,request_id:randomUUID(),action,...extra});
 review=await request('/api/stakeholders/chat',body('sarah','start'));
 assert.ok(review.conversations.sarah.messages[0].content.length>40);
 const student=body('sarah','send',{message:'These scores describe only the five synthetic records. I would measure reviewer time and false negatives against a manual baseline before claiming savings. I would test equivalent terminology and varied resume formats.'});
 review=await request('/api/stakeholders/chat',student);assert.equal(review.conversations.sarah.messages.length,3);
 const duplicate=await request('/api/stakeholders/chat',student);assert.equal(duplicate.conversations.sarah.messages.length,3);
 review=await request('/api/stakeholders/chat',body('zack','start'));
 review=await request('/api/stakeholders/chat',body('zack','send',{message:'I cannot establish fairness from five records or without appropriate group data. A named recruiter should review uncertainty, document evidence and reasons, and own the final decision. I would investigate group outcomes and jurisdiction-specific safeguards before deployment.'}));
 assert.equal(review.conversations.zack.messages.length,3);assert.equal(review.conversations.sarah.messages.length,3);
 const refreshed=await request(endpoint);assert.deepEqual(refreshed.conversations,review.conversations);
 console.log('Both live personas opened, followed up, and retained independent conversations after reload.');
 await request(endpoint,undefined,409,false);
 await request('/api/stakeholders/chat?scenario_id=resume-screener&attempt_id='+randomUUID(),undefined,404);
 await request('/api/stakeholders/chat?scenario_id=missing-case&attempt_id='+attempt.id,undefined,404);
 await request('/api/stakeholders/chat',{...body('sarah','send',{message:'Forged client score'}),accuracy:100},400);
 await request('/api/stakeholders/chat',body('sarah','restart'),400);
 console.log('Missing context, other browser access, forged metrics, and unconfirmed restart were rejected.');
 review=await request('/api/stakeholders/chat',body('sarah','reflect'));
 assert.ok(review.reflection);assert.ok(Object.values(review.reflection).flat().length>0);
 assert.equal((await request(endpoint)).reflection.addressed.length,review.reflection.addressed.length);
 console.log('Live formative reflection generated, citation-validated, and persisted. No formal grade assigned.');
 console.log(JSON.stringify({accuracy:attempt.accuracy,sample_size:5,sarah_messages:review.conversations.sarah.messages.length,zack_messages:review.conversations.zack.messages.length,reflection_sections:Object.keys(review.reflection).length}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
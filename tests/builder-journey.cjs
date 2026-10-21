// Browser regression check with mocked AI responses. Run against the local dev server; no API credits used.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');

const assert=require('node:assert/strict');
const base=process.env.LAB_TEST_URL||'http://127.0.0.1:3001';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'agent-lab-browser-'));
const port=9400+Math.floor(Math.random()*1000);
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--guest','--no-proxy-server','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action,timeout=45000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await action();if(value)return value;}catch(error){last=error;}await delay(250);}throw last||Error('Browser condition timed out');}
async function main(){
 await until(async()=>{const response=await fetch('http://127.0.0.1:'+port+'/json/version');return response.ok;});
 const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(item=>item.type==='page'&&item.url==='about:blank'));
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let seq=0;const pending=new Map();
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.method==='Page.javascriptDialogOpening')socket.send(JSON.stringify({id:++seq,method:'Page.handleJavaScriptDialog',params:{accept:true}}));if(value.method==='Runtime.exceptionThrown')console.error('Browser exception:',value.params.exceptionDetails.exception?.description||value.params.exceptionDetails.text);if(value.method==='Runtime.consoleAPICalled'&&value.params.type==='error')console.error('Browser console:',value.params.args.map(arg=>arg.value||arg.description).join(' ').slice(0,1500));if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}};
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text+': '+(value.result?.description||''));return value.result?.value;}
 async function wait(expression,timeout){return until(()=>evaluate("Boolean("+expression+")"),timeout);}
 async function click(text){return until(()=>evaluate("(()=>{const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()==="+JSON.stringify(text)+");if(!button)throw Error('Control missing: '+"+JSON.stringify(text)+");if(button.disabled)throw Error('Control disabled');button.focus();button.click();return true;})()"));}
 async function navigate(route){await send('Page.navigate',{url:base+route});}
 async function fileUpload(file){await send('DOM.enable');const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#case-file'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});}
 async function screenshot(name){assert.equal(await evaluate("document.querySelectorAll('details,summary,select').length"),0,'Information and choices are visible without dropdowns');fs.mkdirSync('.test-artifacts',{recursive:true});const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('.test-artifacts',name+'.png'),Buffer.from(value.data,'base64'));}
 global.__labDebug=async()=>{console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText.slice(0,1200)})'));await screenshot('browser-failure');};
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.enable');await navigate('/');console.log('Browser connected on port',port);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

﻿ const mock=String.raw`(()=>{
 const original=window.fetch;window.__requests=[];window.__mode='success';
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async(url,options)=>{
  if(url==='/api/stage-test'){
   const input=JSON.parse(options.body);window.__requests.push({url,...input});
   if(window.__mode==='readiness-fail')return json({error:'Private provider details'},502);
   const prior=['extract','check','flag'].slice(0,['extract','check','flag'].indexOf(input.stage));
   const value={id:crypto.randomUUID(),stage:input.stage,record_id:input.record_id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),output:JSON.stringify({evidence:'Original "quoted" evidence (uncertain).',source:input.record_id}),steps:Object.fromEntries(Object.entries(input.steps).map(([k,v])=>[k,v.trim()])),upstream_ids:prior.map(name=>JSON.parse(input.upstream[name]).id),...(input.stage==='flag'?{decision:'human_review',reason:'Uncertain evidence requires permitted human review.'}:{})};
   return json({...value,receipt:JSON.stringify(value)});
  }
  if(url==='/api/local-demo'){
   const input=JSON.parse(options.body);window.__requests.push({url,...input});
   if(window.__mode==='run-fail')return json({error:'Testing is temporarily unavailable. Please retry.'},503);
   const scenario=JSON.parse(sessionStorage.getItem('combined-case')).scenario,n=scenario.items.length;
   const count=Number(sessionStorage.getItem('combined-runs')||0)+1;
   const correct=count===1?Math.floor(n*.6):Math.floor(n*.8);
   const value={id:crypto.randomUUID(),attempt_number:count,created_at:new Date().toISOString(),steps:input.steps,accuracy:Math.round(100*correct/n),mode:'openai',errors:0,planted_caught:0,planted_total:0,results:scenario.items.map((item,i)=>({item_id:item.id,label:item.label,decision:scenario.decisions[0],match:i<correct,reason:'Source evidence (without guessing).',outputs:{extract:JSON.stringify({evidence:'Original facts.',id:item.id}),check:'**Evidence**\n\n- Compare the actual requirement.\n- Do not assume missing facts.',flag:JSON.stringify({decision:scenario.decisions[0],reason:'Source evidence (without guessing).'})},expected_decision:'PRIVATE_GRADING_SENTINEL'}))};
   if(window.__mode==='partial')value.results.pop();
   if(window.__mode==='invalid-grade')value.accuracy=99;
   if(window.__mode==='success')sessionStorage.setItem('combined-runs',String(count));
   return json(value);
  }
  if(url==='/api/attempt-learning'){const input=JSON.parse(options.body);return json({reflection:input.reflection,acknowledged_below_target:false});}
  const response=await original(url,options);
  if(typeof url==='string'&&url.startsWith('/api/cases/')&&response.ok)sessionStorage.setItem('combined-case',JSON.stringify(await response.clone().json()));
  return response;
 };
 })()`;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});await evaluate(mock);
 async function setText(selector,value){await evaluate("(()=>{const el=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");}
 const draft={extract:'Find the relevant facts (including "source quotes").\nKeep original record IDs.',check:'Verify each case requirement against actual evidence and state uncertainties.',flag:'Ignore irrelevant details. Do not credit unsupported claims; use only case-supported human review or rejection.'};
 await wait("document.querySelector('#case-file')");await click('Try Sample Case');await wait("document.querySelector('.selected-case')");await navigate('/workbench');await wait("document.querySelector('#instruction-extract')");
 assert.equal(await evaluate("document.querySelectorAll('.combined-fields textarea').length"),3);
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.combined-fields textarea')].map(el=>el.value)"),['','','']);
 assert.equal(await evaluate("document.querySelector('.builder-progress')"),null);
 assert.equal(await evaluate("document.querySelector('.combined-help').hasAttribute('data-information')"),true);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Next: Review')).disabled"),true);
 for(const [name,value]of Object.entries(draft))await setText('#instruction-'+name,value);
 await screenshot('combined-write-desktop');await click('Next: Review My Instructions');await wait("document.querySelector('.assembled-instructions')");
 assert.equal(await evaluate("document.querySelector('.assembled-instructions').textContent"),"LOOK FOR:\n"+draft.extract+"\n\nVERIFY:\n"+draft.check+"\n\nDON'T INCLUDE:\n"+draft.flag);
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.combined-actions>.button')].map(el=>el.textContent.trim())"),['Back to Edit','Test My AI Agent']);await screenshot('combined-review-desktop');await send('Page.reload');await wait("document.querySelector('#instruction-extract')");assert.deepEqual(await evaluate("[...document.querySelectorAll('.combined-fields textarea')].map(el=>el.value)"),Object.values(draft),'saved review sessions reopen exact editable drafts');assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Test My AI Agent').disabled"),false);
 await evaluate("window.__mode='readiness-fail'");await click('Test My AI Agent');await wait("document.querySelector('[role=alert]')");assert.equal(await evaluate("window.__requests.some(r=>r.url==='/api/local-demo')"),false);assert.equal(await evaluate("document.body.textContent.includes('Private provider details')"),false);
 await click('Next: Review My Instructions');await wait("document.querySelector('.assembled-instructions')");await evaluate("window.__mode='run-fail'");await click('Test My AI Agent');await wait("document.querySelector('[role=alert]')?.textContent.includes('could not finish this test')");
 assert.deepEqual(await evaluate("window.__requests.filter(r=>r.url==='/api/stage-test').slice(-3).map(r=>r.stage)"),['extract','check','flag']);
 const checks=await evaluate("window.__requests.filter(r=>r.url==='/api/stage-test').length");
 for(const mode of ['partial','invalid-grade']){
  await evaluate('window.__mode='+JSON.stringify(mode));await click('Test My AI Agent');await wait("document.querySelector('.incomplete-run')");assert.equal(await evaluate("document.querySelector('.combined-score')"),null);assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')||'[]').length"),0);await click('Improve My Instructions');await wait("document.querySelector('#instruction-extract')");assert.equal(await evaluate("document.querySelector('#instruction-extract').value"),draft.extract);await click('Next: Review My Instructions');
 }
 await evaluate("window.__mode='success'");await click('Test My AI Agent');await wait("document.querySelector('.combined-score h3')?.textContent==='60%'");
 assert.equal(await evaluate('location.pathname'),'/workbench');assert.equal(await evaluate("window.__requests.filter(r=>r.url==='/api/stage-test').length"),checks,'unchanged valid checks are reused');
 assert.equal(await evaluate("document.querySelector('.combined-score>p').textContent"),'3 out of 5 decisions correct');assert.equal(await evaluate("document.body.textContent.includes('PRIVATE_GRADING_SENTINEL')"),false);
 assert.equal(await evaluate("document.querySelector('.combined-details').hasAttribute('data-information')"),true);assert.ok(await evaluate("document.querySelector('.combined-record').textContent.includes('Original facts.')"));await screenshot('combined-results-desktop');
 await click('Improve My Instructions');await wait("document.querySelector('#instruction-check')");await setText('#instruction-check',draft.check+' Clarify uncertainty.');await click('Next: Review My Instructions');assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Test My AI Agent')).disabled"),true);
 await click('Review my results');await wait("document.querySelector('#builder-reflection')");await setText('#builder-reflection','I will clarify uncertainty and check the evidence for each recommendation.');await click('Save Reflection');await wait("document.querySelector('.success-text')?.textContent.includes('Reflection saved')");
 await click('Improve My Instructions');await wait("document.querySelector('#instruction-check')");await click('Next: Review My Instructions');await click('Test My AI Agent');await wait("document.querySelector('.combined-score h3')?.textContent==='80%'");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).length"),2);
 assert.deepEqual(await evaluate("window.__requests.filter(r=>r.url==='/api/stage-test').slice(-2).map(r=>r.stage)"),['check','flag']);
 assert.ok(await evaluate("document.querySelector('.combined-comparison').textContent.includes('20 percentage points')"));
 await send('Page.reload');await wait("document.querySelector('.combined-score h3')?.textContent==='80%'");await click('Improve My Instructions');await wait("document.querySelector('#instruction-extract')");assert.equal(await evaluate("document.querySelector('#instruction-extract').value"),draft.extract);
 const long='A longer exact instruction (not silently truncated). '.repeat(35);await setText('#instruction-extract',long);await send('Page.reload');await wait("document.querySelector('#instruction-extract')");assert.equal(await evaluate("document.querySelector('#instruction-extract').value"),long);await setText('#instruction-extract',draft.extract);
 for(const size of [{width:1024,height:900},{width:768,height:900},{width:390,height:844},{width:320,height:740}]){await send('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:size.width<700});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('combined-write-'+size.width);}
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate("(()=>{document.querySelectorAll('#practice-record input[type=radio]')[1].click();})()");await click('Next: Review My Instructions');await click('Test My AI Agent');await wait("document.querySelector('.combined-score')");assert.equal(await evaluate("window.__requests.filter(r=>r.url==='/api/stage-test').length"),3,'record change retests all internal operations after reload');
 await navigate('/');await wait("document.querySelector('#case-file')");
 const uploaded={...JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8')),id:'combined-upload-test',title:'Uploaded combined workflow',items:[{id:'A-02',label:'First uploaded record',text:'Original source evidence A.'},{id:'A-10',label:'Second uploaded record',text:'Original source evidence B.'}],answer_key:[{item_id:'A-02',decision:'advance',planted:false,note:'PRIVATE_UPLOAD_NOTE'},{item_id:'A-10',decision:'human_review',planted:false,note:'PRIVATE_UPLOAD_NOTE'}]};
 const uploadedFile=path.join(profile,'combined-upload.json');fs.writeFileSync(uploadedFile,JSON.stringify(uploaded));await fileUpload(uploadedFile);await wait("document.body.textContent.includes('Case validated.')");await navigate('/workbench');await wait("document.querySelector('#instruction-extract')");for(const [name,value]of Object.entries(draft))await setText('#instruction-'+name,value);await click('Next: Review My Instructions');await click('Test My AI Agent');await wait("document.querySelector('.combined-score')");assert.equal(await evaluate("document.querySelector('.combined-score>p').textContent"),'1 out of 2 decisions correct');assert.equal(await evaluate("document.body.textContent.includes('PRIVATE_UPLOAD_NOTE')"),false);
 console.log('Combined builder passed: blank fields, exact review, signed readiness chain, API failures, partial/invalid grading, real denominators, reflection gates, iteration/history, saved long drafts, changed records, uploaded case, and responsive layouts. AI responses are mocked; no credits used.');
}
main().catch(async error=>{console.error(error.stack);await global.__labDebug?.();process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});

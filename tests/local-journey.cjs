// Optional real-browser integration check. Requires Windows Edge and a running dev server.
// Executes five real stage tests, three full runs, optional coaching, and stakeholder openings. Full runs are paid when DEMO_MODE=false.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
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
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.method==='Runtime.exceptionThrown')console.error('Browser exception:',value.params.exceptionDetails.exception?.description||value.params.exceptionDetails.text);if(value.method==='Runtime.consoleAPICalled'&&value.params.type==='error')console.error('Browser console:',value.params.args.map(arg=>arg.value||arg.description).join(' ').slice(0,1500));if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}};
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text+': '+(value.result?.description||''));return value.result?.value;}
 async function wait(expression,timeout){return until(()=>evaluate("Boolean("+expression+")"),timeout);}
 async function click(text){return until(()=>evaluate("(()=>{const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()==="+JSON.stringify(text)+");if(!button)throw Error('Control missing: '+"+JSON.stringify(text)+");if(button.disabled)throw Error('Control disabled');button.click();return true;})()"));}
 async function navigate(route){await send('Page.navigate',{url:base+route});}
 async function fileUpload(file){await send('DOM.enable');const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#case-file'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});}
 async function screenshot(name){fs.mkdirSync('.test-artifacts',{recursive:true});const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('.test-artifacts',name+'.png'),Buffer.from(value.data,'base64'));}
 global.__labDebug=async()=>{console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText.slice(0,1200)})'));await screenshot('browser-failure');};
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.enable');await navigate('/');console.log('Browser connected on port',port);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await wait("document.body?.textContent.includes('Start Your Challenge')");assert.equal(await evaluate("document.querySelector('nav [aria-current=step]')?.textContent.includes('Case Upload')"),true);assert.equal(await evaluate("document.querySelectorAll('.quick-steps li').length"),3);assert.equal(await evaluate("document.querySelector('.case-file-help').open"),false);await evaluate("document.querySelector('.skip-link').focus()");assert.equal(await evaluate("getComputedStyle(document.activeElement).transform"),'matrix(1, 0, 0, 1, 0, 0)');
 await navigate('/workbench');await wait("document.body?.textContent.includes('Start with a case.')");
 console.log('Direct navigation without a case is handled.');
 await click('Choose a case');await wait("document.querySelector('#case-file')");
 const invalidFile=path.join(profile,'invalid.json');fs.writeFileSync(invalidFile,'{"title":"Missing required fields"}');
 await fileUpload(invalidFile);await wait("document.querySelector('[role=alert]')?.textContent.includes('required format')");
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Continue').disabled"),true);
 console.log('Invalid uploads are rejected with Continue disabled.');
 const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
 const validFile=path.join(profile,'case.json');fs.writeFileSync(validFile,JSON.stringify({...sample,id:'custom-review',title:'Quarterly evidence review',story:'A client needs a consistent evidence review.',skill_tags:['Critical evaluation']}));
 await fileUpload(validFile);await wait("document.body?.textContent.includes('Case validated.')");
 await click('Continue');await wait("location.pathname==='/scenario'&&document.body?.textContent.includes('Quarterly evidence review')");
 await evaluate("document.querySelector('#briefing-tab-mission').click()");await wait("document.querySelector('#briefing-panel-mission:not([hidden])')");assert.equal(await evaluate("document.body?.textContent.includes('Critical evaluation')"),true);
 const payload=await evaluate("fetch('/api/cases/'+JSON.parse(localStorage.getItem('agent-lab.flow.v1.local')).caseId).then(r=>r.json()).then(v=>({hasGrading:!!v.scenario.answer_key,hasRubric:!!v.scenario.rubric,records:v.scenario.items.length}))");
 assert.deepEqual(payload,{hasGrading:false,hasRubric:false,records:5});
 console.log('Valid upload, dynamic briefing, and grading redaction passed.');
 await evaluate("document.querySelector('#briefing-tab-scenario').click()");await click('Back to Upload');await wait("document.querySelector('#case-file')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('upload-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(200);await screenshot('upload-desktop');
 await click('Try Sample Case');await wait("document.querySelector('.selected-case')?.textContent.includes('Screening analyst applications')");assert.equal(await evaluate('location.pathname'),'/');await click('Continue');await wait("location.pathname==='/scenario'&&document.body?.textContent.includes('Screening analyst applications')");await screenshot('scenario-desktop');

 await evaluate("document.querySelector('#briefing-tab-mission').click()");await click("I'm Ready to Build My Agent");await wait("document.body?.textContent.includes('Build Your AI Agent')");
 await click('Start Building');await wait("document.querySelector('#stage-extract')");
 assert.equal(await evaluate("document.querySelectorAll('.focused-editor textarea').length"),1);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continue to Check').disabled"),true);
 const draftExpression="(()=>{const f=JSON.parse(localStorage.getItem('agent-lab.flow.v1.local'));return f.drafts[f.caseId]||f.builders[f.caseId]?.tests.extract[0]?.steps||null;})()";
 const progressExpression="(()=>{const f=JSON.parse(localStorage.getItem('agent-lab.flow.v1.local'));return f.builders[f.caseId];})()";
 async function goStage(name){await evaluate("(()=>{const b=[...document.querySelectorAll('.builder-progress button')].find(b=>b.querySelector('strong')?.textContent==="+JSON.stringify(name)+");if(!b||b.disabled)throw Error('Stage navigation unavailable');b.click();return true;})()");}
 async function practice(name){
  const before=await evaluate(progressExpression+"?.tests."+name.toLowerCase()+"?.[0]?.id");
  await click('Test My '+name+' Instructions');
  await wait("document.querySelector('.stage-test-output .test-badge.current')&&("+progressExpression+").tests."+name.toLowerCase()+"[0]?.id!=="+JSON.stringify(before||null),60000);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')||'[]').length"),0);
 }
 await practice('Extract');const initial=await evaluate(draftExpression);
 await click('Continue to Check');await wait("document.querySelector('#stage-check')");
 await send('Page.reload');await wait("document.querySelector('#stage-check')");
 assert.deepEqual(await evaluate(draftExpression),initial);
 assert.ok(await evaluate("document.querySelector('.stage-input').textContent.includes('Extract output')"));
 await practice('Check');await click('Continue to Flag');await wait("document.querySelector('#stage-flag')");await practice('Flag');
 await click('Review My Complete Agent');await wait("document.querySelectorAll('.agent-summary').length===3");
 assert.equal(await evaluate("document.querySelectorAll('.agent-summary .test-badge.current').length"),3);
 await screenshot('builder-review-desktop');
 await goStage('Extract');await wait("document.querySelector('#stage-extract')");await screenshot('builder-desktop');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('builder-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await goStage('Final Review');await wait("document.querySelectorAll('.agent-summary').length===3");

 await click('Run My Complete Agent');await wait("document.body?.textContent.includes('Running your agent on 5 records')");
 await wait("location.pathname==='/results'&&document.querySelectorAll('[role=tab]').length===3",140000);
 assert.equal(await evaluate("document.querySelectorAll('[role=tabpanel]').length"),1);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1'))[0].results.length"),5);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1'))[0].results.some(r=>'expected_decision' in r)"),false);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1'))[0].errors"),0);
 await screenshot('results-desktop');
 await evaluate("document.querySelector('#results-tab-results').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
 await wait("document.querySelector('#results-tab-investigate').getAttribute('aria-selected')==='true'");
 await evaluate("(()=>{const c=document.querySelector('.investigation-toolbar input');if(!c.checked)c.click();return true;})()");await wait("document.querySelectorAll('.investigation-card').length===5");
 await evaluate("document.querySelector('.investigation-card>.button').click()");await wait("!document.querySelector('.record-investigation').hidden");await click('Give Me a Hint');
 await evaluate("document.querySelector('.record-investigation .text-button').click()");await wait("document.querySelector('dialog')?.open");
 assert.equal(await evaluate("document.querySelectorAll('.trace-stage pre').length"),3);
 assert.equal(await evaluate("document.querySelector('.original-record p').textContent.includes('Priya')"),true);
 assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Equivalent professional experience should be recognized')"),false);
 await screenshot('inspect-desktop');await click('Close inspection');await screenshot('results-investigate');
 await click('Next: Improve My Agent');await wait("document.querySelector('#improvement-reflection')");
 assert.equal(await evaluate("document.querySelector('.ai-suggestions')===null"),true);
 async function reflect(text){await evaluate("(()=>{const el=document.querySelector('#improvement-reflection');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(text)+");el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");await click('Save Reflection');await wait("document.querySelector('.learning-status')?.textContent.includes('Reflection saved')");}
 async function returnBuilder(){await evaluate("(()=>{const b=[...document.querySelectorAll('.next-learning-actions button')].find(b=>b.textContent.includes('Improve My Instructions')||b.textContent.includes('Improve My Agent Anyway'));b.click();return true;})()");await wait("location.pathname==='/workbench'&&document.querySelectorAll('.agent-summary').length===3");}
 await reflect('I will clarify what counts as equivalent evidence so uncertain records are evaluated consistently.');
 await screenshot('results-improve');await returnBuilder();assert.deepEqual(await evaluate(draftExpression),initial);
 await goStage('Check');await wait("document.querySelector('#stage-check')");
 const revised=initial.check+' Explicitly consider equivalent relevant experience.';
 await evaluate("(()=>{const el=document.querySelector('#stage-check');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(revised)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await wait("document.querySelector('#stage-check').value==="+JSON.stringify(revised));await goStage('Final Review');await wait("document.querySelectorAll('.agent-summary').length===3");
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Run My Complete Agent').disabled"),true);
 assert.equal(await evaluate("document.querySelectorAll('.agent-summary .test-badge.current').length"),1);
 await goStage('Check');await wait("document.querySelector('#stage-check')");const checkBefore=await evaluate("("+progressExpression+").tests.check[0].id");await click('Test My Check Instructions');await wait("document.querySelector('.stage-test-output .test-badge.current')&&("+progressExpression+").tests.check[0].id!=="+JSON.stringify(checkBefore),60000);
 await click('Continue to Flag');await wait("document.querySelector('#stage-flag')");const flagBefore=await evaluate("("+progressExpression+").tests.flag[0].id");await click('Test My Flag Instructions');await wait("document.querySelector('.stage-test-output .test-badge.current')&&("+progressExpression+").tests.flag[0].id!=="+JSON.stringify(flagBefore),60000);
 await click('Review My Complete Agent');await wait("document.querySelectorAll('.agent-summary').length===3");await click('Run My Complete Agent');await wait("location.pathname==='/results'&&document.querySelectorAll('[role=tab]').length===3",140000);
 await send('Page.reload');await wait("document.querySelectorAll('.attempt-button').length===2");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).filter(a=>a.errors===0).length"),2);
 await evaluate("document.querySelector('.learning-history').open=true;document.querySelector('#compare-attempt').value=document.querySelector('#compare-attempt option:nth-child(2)').value;document.querySelector('#compare-attempt').dispatchEvent(new Event('change',{bubbles:true}));true;");await wait("document.querySelector('.attempt-comparison')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('results-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('#results-tab-improve').click()");await wait("document.querySelector('#improvement-reflection')");await reflect('I will compare each recorded output with my criteria and make uncertainty handling more explicit.');await returnBuilder();
 await click('Run My Complete Agent');await wait("location.pathname==='/results'&&document.querySelectorAll('[role=tab]').length===3",140000);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).length"),3);
 await evaluate("document.querySelector('#results-tab-improve').click()");await wait("document.querySelector('.ai-suggestions')");
 const instructionsBefore=await evaluate(draftExpression);await click('Get AI Suggestions');await wait("document.querySelectorAll('.ai-suggestions article').length>0",60000);assert.deepEqual(await evaluate(draftExpression),instructionsBefore);
 await reflect('I will evaluate the coaching suggestions against the actual evidence and preserve human review for uncertainty.');
 const hasAck=await evaluate("!!document.querySelector('.below-target-ack input')");
 if(hasAck){await evaluate("document.querySelector('.below-target-ack input').click()");await click('Continue to Stakeholder Review with Acknowledgment');}else await click('Continue to Stakeholder Review');
 await wait("location.pathname==='/stakeholders'&&document.querySelectorAll('.stakeholder-card').length===2",60000);await wait("document.querySelectorAll('.chat-message').length>0",60000);
 await evaluate("document.querySelectorAll('.stakeholder-card')[1].click()");await wait("document.querySelector('.chat-heading h2')?.textContent.includes('Zack')&&document.querySelectorAll('.chat-message').length>0",60000);
 await screenshot('stakeholders-after-results');
 console.log('Three full runs, five real stage tests, three-tab navigation, keyboard navigation, hints, reflection persistence, actual comparisons, optional real coaching, unchanged drafts, and both stakeholder openings passed.');
 await navigate('/results');await wait("document.querySelectorAll('[role=tab]').length===3");await evaluate("document.querySelector('#results-tab-improve').click()");await wait("document.querySelector('#improvement-reflection')");await returnBuilder();
 await evaluate("window.__originalFetch=window.fetch;window.fetch=(url,options)=>url==='/api/local-demo'?Promise.resolve(new Response(JSON.stringify({error:'Test rate limit. Please retry shortly.'}),{status:429,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options)");
 await click('Run My Complete Agent');await wait("document.querySelector('[role=alert]')?.textContent.includes('Test rate limit')");assert.equal(await evaluate('location.pathname'),'/workbench');assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).length"),3);
 console.log('AI failure stays in builder, shows an error, and preserves all attempts and saved reflections.');

}
main().catch(async error=>{console.error(error.message);await global.__labDebug?.();process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});
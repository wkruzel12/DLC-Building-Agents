// Optional real-browser integration check. Requires Windows Edge and a running dev server.
// Executes two paid OpenAI runs when DEMO_MODE=false. Never prints credentials or traces.
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
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.method==='Runtime.exceptionThrown')console.error('Browser exception:',value.params.exceptionDetails.exception?.description||value.params.exceptionDetails.text);if(value.method==='Runtime.consoleAPICalled'&&value.params.type==='error')console.error('Browser console:',value.params.args.map(arg=>arg.value||arg.description).join(' ').slice(0,1500));if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}};
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text+': '+(value.result?.description||''));return value.result?.value;}
 async function wait(expression,timeout){return until(()=>evaluate(expression),timeout);}
 async function click(text){return evaluate("(()=>{const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()==="+JSON.stringify(text)+");if(!button)throw Error('Control missing: '+"+JSON.stringify(text)+");if(button.disabled)throw Error('Control disabled');button.click();return true;})()");}
 async function navigate(route){await send('Page.navigate',{url:base+route});}
 async function fileUpload(file){await send('DOM.enable');const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#case-file'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});}
 async function screenshot(name){fs.mkdirSync('.test-artifacts',{recursive:true});const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('.test-artifacts',name+'.png'),Buffer.from(value.data,'base64'));}
 global.__labDebug=async()=>{console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText.slice(0,1200)})'));await screenshot('browser-failure');};
 await send('Page.enable');await send('Runtime.enable');await navigate('/');console.log('Browser connected on port',port);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await wait("document.body?.textContent.includes('Your next challenge starts here.')");
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
 assert.equal(await evaluate("document.body?.textContent.includes('Critical evaluation')"),true);
 const payload=await evaluate("fetch('/api/cases/'+JSON.parse(localStorage.getItem('agent-lab.flow.v1.local')).caseId).then(r=>r.json()).then(v=>({hasGrading:!!v.scenario.answer_key,hasRubric:!!v.scenario.rubric,records:v.scenario.items.length}))");
 assert.deepEqual(payload,{hasGrading:false,hasRubric:false,records:5});
 console.log('Valid upload, dynamic briefing, and grading redaction passed.');
 await click('Back to Upload');await wait("document.querySelector('#case-file')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('upload-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(200);await screenshot('upload-desktop');
 await click('Try Sample Case');await wait("location.pathname==='/scenario'&&document.body?.textContent.includes('Screening analyst applications')");await screenshot('scenario-desktop');
 await click('Continue to Agent Builder');await wait("document.querySelectorAll('textarea').length===3");
 const initial=await evaluate("[...document.querySelectorAll('textarea')].map(el=>el.value)");
 await click('Back to Scenario');await click('Continue to Agent Builder');await wait("document.querySelectorAll('textarea').length===3");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('textarea')].map(el=>el.value)"),initial);await screenshot('builder-desktop');
 await click('Run Agent');await wait("document.body?.textContent.includes('Running your agent on 5 records')");
 await wait("location.pathname==='/results'&&document.querySelectorAll('tbody tr').length===5",140000);
 assert.equal(await evaluate("document.querySelectorAll('.attempt-button').length"),1);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1'))[0].errors"),0);
 await screenshot('results-desktop');
 await evaluate("document.querySelector('tbody .inspect-button').click()");await wait("document.querySelector('dialog')?.open");
 assert.equal(await evaluate("document.querySelectorAll('.trace-stage pre').length"),3);
 assert.equal(await evaluate("document.querySelector('.original-record p').textContent.includes('Priya')"),true);
 assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Equivalent professional experience should be recognized')"),false);
 await screenshot('inspect-desktop');await click('Close inspection');
 await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Improve My Agent').click()");await wait("location.pathname==='/workbench'&&document.querySelectorAll('textarea').length===3");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('textarea')].map(el=>el.value)"),initial);
 const revised=initial[1]+' Explicitly consider equivalent relevant experience.';
 await evaluate("(()=>{const el=document.querySelector('#stage-check');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(revised)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await wait("document.querySelector('#stage-check').value==="+JSON.stringify(revised));
 await click('Run Agent');await wait("location.pathname==='/results'&&document.querySelectorAll('.attempt-button').length===2",140000);
 await send('Page.reload');await wait("document.querySelectorAll('.attempt-button').length===2");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).filter(a=>a.errors===0).length"),2);
 await evaluate("document.querySelectorAll('.attempt-button')[1].click()");await wait("document.querySelector('.results-subheading').textContent.includes('Attempt 1')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('results-mobile');
 console.log('Two live five-record runs, inspection, instruction revision, history selection, refresh persistence, and responsive layouts passed.');
 // Inject a local API failure in the isolated test tab without changing the server or key.
 await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Improve My Agent').click()");await wait("document.querySelectorAll('textarea').length===3");
 await evaluate("window.__originalFetch=window.fetch;window.fetch=(url,options)=>url==='/api/local-demo'?Promise.resolve(new Response(JSON.stringify({error:'Test rate limit. Please retry shortly.'}),{status:429,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options)");
 await click('Run Agent');await wait("document.querySelector('[role=alert]')?.textContent.includes('Test rate limit')");assert.equal(await evaluate('location.pathname'),'/workbench');
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).length"),2);
 console.log('AI failure stays in builder, shows an error, and preserves saved attempts.');
}
main().catch(async error=>{console.error(error.message);await global.__labDebug?.();process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});
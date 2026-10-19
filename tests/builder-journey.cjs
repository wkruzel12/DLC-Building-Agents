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
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.method==='Runtime.exceptionThrown')console.error('Browser exception:',value.params.exceptionDetails.exception?.description||value.params.exceptionDetails.text);if(value.method==='Runtime.consoleAPICalled'&&value.params.type==='error')console.error('Browser console:',value.params.args.map(arg=>arg.value||arg.description).join(' ').slice(0,1500));if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}};
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text+': '+(value.result?.description||''));return value.result?.value;}
 async function wait(expression,timeout){return until(()=>evaluate("Boolean("+expression+")"),timeout);}
 async function click(text){return until(()=>evaluate("(()=>{const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()==="+JSON.stringify(text)+");if(!button)throw Error('Control missing: '+"+JSON.stringify(text)+");if(button.disabled)throw Error('Control disabled');button.focus();button.click();return true;})()"));}
 async function navigate(route){await send('Page.navigate',{url:base+route});}
 async function fileUpload(file){await send('DOM.enable');const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#case-file'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});}
 async function screenshot(name){fs.mkdirSync('.test-artifacts',{recursive:true});const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('.test-artifacts',name+'.png'),Buffer.from(value.data,'base64'));}
 global.__labDebug=async()=>{console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText.slice(0,1200)})'));await screenshot('browser-failure');};
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.enable');await navigate('/');console.log('Browser connected on port',port);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

 const mock=`(()=>{
 const original=window.fetch;window.__requests=[];
 window.fetch=async(url,options)=>{
  if(url==='/api/stage-test'){
   const input=JSON.parse(options.body);window.__requests.push(input);
   if(window.__failTest)return new Response(JSON.stringify({error:'Technical provider configuration error'}),{status:502});
   const previous=['extract','check','flag'].slice(0,['extract','check','flag'].indexOf(input.stage));
   const upstream=previous.map(name=>JSON.parse(input.upstream[name]).id);
   const value={id:crypto.randomUUID(),stage:input.stage,record_id:input.record_id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),output:input.stage==='extract'?'Relevant evidence: documented experience.':input.stage==='check'?'Evidence compared with the stated requirements.':'Recommendation based on evaluated evidence.',steps:Object.fromEntries(Object.entries(input.steps).map(([k,v])=>[k,v.trim()])),upstream_ids:upstream,...(input.stage==='flag'?{decision:'advance',reason:'Practice explanation.'}:{})};
   return new Response(JSON.stringify({...value,receipt:JSON.stringify(value)}),{headers:{'Content-Type':'application/json'}});
  }
  if(url==='/api/local-demo'){window.__run=JSON.parse(options.body);return new Response(JSON.stringify({error:'Practice full-run failure. Try again.'}),{status:429});}
  return original(url,options);
 };
 })()`;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});await evaluate(mock);
 await wait("document.querySelector('#case-file')");await click('Try Sample Case');await wait("document.querySelector('.selected-case')");await navigate('/workbench');await wait("document.querySelector('#stage-extract')");
 const progress="(()=>{const f=JSON.parse(localStorage.getItem('agent-lab.flow.v1.local'));return f.builders[f.caseId];})()";
 const drafts="(()=>{const f=JSON.parse(localStorage.getItem('agent-lab.flow.v1.local'));return f.drafts[f.caseId]||f.builders[f.caseId]?.tests.extract[0]?.steps;})()";
 async function go(name){await evaluate("(()=>{const b=[...document.querySelectorAll('.builder-progress button')].find(b=>b.querySelector('strong').textContent==="+JSON.stringify(name)+");if(!b||b.disabled)throw Error('Stage locked');b.click();})()");}
 async function practice(name){await click('Test My '+name+' Instructions');await wait("document.querySelector('.stage-test-output .test-badge.current')");}
 async function edit(text){await evaluate("(()=>{const el=document.querySelector('.focused-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(text)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");}
 assert.equal(await evaluate("document.querySelectorAll('.builder-progress li').length"),4);
 assert.equal(await evaluate("document.querySelectorAll('.focused-editor textarea').length"),1);
 assert.equal(await evaluate("document.querySelector('.builder-help').open"),false);
 assert.equal(await evaluate("document.querySelector('.stage-test-output')===null"),true);
 assert.equal(await evaluate("document.querySelector('.stage-next button')===null"),true);
 assert.equal(await evaluate("document.querySelectorAll('.builder-progress button:disabled').length"),3);
 await screenshot('simple-builder-extract');
 await evaluate("document.querySelector('.builder-help summary').click()");assert.equal(await evaluate("document.querySelector('.builder-help').open"),true);
 assert.equal(await evaluate("document.querySelector('.builder-help').textContent.includes('Common mistake')"),true);
 await evaluate("document.querySelector('.builder-help summary').click();document.querySelector('.builder-materials summary').click()");await click('View Case Materials');await wait("document.querySelector('dialog')?.open");await evaluate("document.querySelector('[aria-label=\"Close Case Materials\"]').click()");await wait("!document.querySelector('dialog')");await evaluate("document.querySelector('.builder-materials summary').click()");
 await edit('Extract only the documented evidence and mark missing facts.');await evaluate('window.__failTest=true');await click('Test My Extract Instructions');await wait("document.querySelector('.builder-workspace [role=alert]')");
 assert.equal(await evaluate("document.querySelector('[role=alert]').textContent.includes('Technical provider')"),false);
 assert.equal(await evaluate("document.querySelector('.stage-next button')===null"),true);
 await evaluate('window.__failTest=false');await practice('Extract');
 assert.equal(await evaluate("document.querySelectorAll('.builder-workspace .button.primary').length"),1);
 await screenshot('simple-builder-extract-result');
 await click('Continue to Check');await wait("document.querySelector('#stage-check')");
 assert.equal(await evaluate("document.querySelector('.builder-help').open"),false);
 assert.equal(await evaluate("document.querySelector('.stage-test-output')===null"),true);
 await screenshot('simple-builder-check');await practice('Check');await click('Continue to Flag');await wait("document.querySelector('#stage-flag')");
 assert.equal(await evaluate("document.querySelectorAll('.allowed-actions .decision').length>0"),true);
 await screenshot('simple-builder-flag');await practice('Flag');const original=await evaluate(drafts);
 await click('Review My Complete Agent');await wait("document.querySelectorAll('.agent-summary').length===3");
 assert.equal(await evaluate("document.querySelectorAll('.agent-summary .test-badge.current').length"),3);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Run My Complete Agent').disabled"),false);
 await screenshot('simple-builder-review');
 await send('Page.reload');await wait("document.querySelectorAll('.agent-summary').length===3");assert.deepEqual(await evaluate(drafts),original);
 await go('Check');await wait("document.querySelector('#stage-check')");await edit(original.check+' Mark uncertain evidence explicitly.');
 await wait("!document.querySelector('.stage-test-output .test-badge.current')");
 assert.equal(await evaluate("document.querySelector('.test-history')!==null"),true);
 await go('Final Review');assert.equal(await evaluate("document.querySelectorAll('.agent-summary .test-badge.current').length"),1);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Run My Complete Agent').disabled"),true);
 await go('Check');await practice('Check');await click('Continue to Flag');await practice('Flag');await click('Review My Complete Agent');
 await click('Run My Complete Agent');await wait("document.querySelector('[role=alert]')?.textContent.includes('Practice full-run failure')");
 assert.equal(await evaluate('window.__run.steps.check'),original.check+' Mark uncertain evidence explicitly.');
 await go('Extract');const oldRecord=await evaluate("document.querySelector('#practice-record').value");
 await evaluate("(()=>{const el=document.querySelector('#practice-record');el.value=el.options[1].value;el.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await wait("document.querySelector('#practice-record').value!=="+JSON.stringify(oldRecord));
 assert.equal(await evaluate("document.querySelector('.stage-test-output .test-badge.current')===null"),true);
 assert.equal(await evaluate("document.querySelector('.stage-next button')===null"),true);
 await send('Page.reload');await wait("document.querySelector('#stage-extract')");assert.notEqual(await evaluate("document.querySelector('#practice-record').value"),oldRecord);
 for(const size of [{width:1024,height:900},{width:390,height:844},{width:320,height:740}]){
  await send('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:size.width<700});await delay(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No horizontal overflow at '+size.width);
  assert.equal(await evaluate("new Set([...document.querySelectorAll('.builder-progress button')].map(b=>Math.round(b.getBoundingClientRect().top))).size"),1,'Four steps stay in one row');
  await screenshot('simple-builder-'+size.width);
 }
 console.log('All four stages, optional help/materials, failed/successful tests, progression gates, single primary action, saved drafts/results/record selection, stale tests, full-run payload and responsive layouts passed (mocked AI; no API credits used).');
}
main().catch(async error=>{console.error(error.stack);await global.__labDebug?.();process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});

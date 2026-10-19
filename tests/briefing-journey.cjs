// Optional real-browser integration check. Requires Windows Edge and a running dev server.
// Verifies briefing and reference materials. Makes three real isolated stage tests; no full simulation attempts.
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
 async function click(text){return until(()=>evaluate("(()=>{const button=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()==="+JSON.stringify(text)+");if(!button)throw Error('Control missing: '+"+JSON.stringify(text)+");if(button.disabled)throw Error('Control disabled');button.focus();button.click();return true;})()"));}
 async function navigate(route){await send('Page.navigate',{url:base+route});}
 async function fileUpload(file){await send('DOM.enable');const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#case-file'});await send('DOM.setFileInputFiles',{nodeId,files:[file]});}
 async function screenshot(name){fs.mkdirSync('.test-artifacts',{recursive:true});const value=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('.test-artifacts',name+'.png'),Buffer.from(value.data,'base64'));}
 global.__labDebug=async()=>{console.log(await evaluate('JSON.stringify({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText.slice(0,1200)})'));await screenshot('browser-failure');};
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Runtime.enable');await navigate('/');console.log('Browser connected on port',port);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

 await wait("document.querySelector('#case-file')");await click('Try Sample Case');await wait("document.querySelector('.selected-case')");await click('Continue');await wait("document.querySelector('#briefing-tab-scenario')");
 assert.equal(await evaluate("document.querySelectorAll('.briefing-tabs [role=tab]').length"),3);
 assert.equal(await evaluate("document.querySelectorAll('.briefing-activity:not([hidden])').length"),1);
 await screenshot('briefing-scenario-desktop');
 await evaluate("document.querySelector('#briefing-tab-scenario').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});await wait("document.querySelector('#briefing-tab-materials').getAttribute('aria-selected')==='true'");
 await wait("document.querySelectorAll('.material-card').length===8");assert.equal(await evaluate("document.querySelector('.material-library').textContent.includes('Excel pivot tables')"),false);
 async function setSearch(text){await evaluate("(()=>{const el=document.querySelector('.material-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,"+JSON.stringify(text)+");el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");}
 async function setFilter(value){await evaluate("(()=>{const el=document.querySelector('.material-search select');el.value="+JSON.stringify(value)+";el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");}
 await setSearch('r02');await wait("document.querySelectorAll('.material-card').length===1");await evaluate("document.querySelector('.material-card button').click()");await wait("document.querySelector('.material-full-text')?.textContent.includes('Power Query')");
 const full=await evaluate("document.querySelector('.material-full-text').textContent");assert.equal(full,JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8')).items[1].text);
 assert.equal(await evaluate("document.activeElement.id===document.querySelector('.material-reader h3').id"),true);
 await click('Close Document');await wait("document.querySelectorAll('.material-card').length===1");assert.equal(await evaluate("document.activeElement.textContent.includes('Review Document')"),true);
 await setSearch('does-not-exist');await wait("document.querySelector('.materials-empty')");await click('Clear Search & Filters');await wait("document.querySelectorAll('.material-card').length===8");await setFilter('record');await wait("document.querySelectorAll('.material-card').length===5");
 await screenshot('briefing-materials-desktop');await click('Next: Understand Your Mission');await wait("document.querySelectorAll('.mission-workflow>li').length===3");await screenshot('briefing-mission-desktop');
 await evaluate("document.querySelector('#briefing-tab-materials').click()");await wait("document.querySelectorAll('.material-card').length===5");assert.equal(await evaluate("document.querySelector('.material-search select').value"),'record');
 await send('Page.reload');await wait("document.querySelector('#briefing-tab-materials').getAttribute('aria-selected')==='true'&&document.querySelectorAll('.material-card').length===5");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('briefing-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('#briefing-tab-scenario').click()");await click('Back to Upload');await wait("document.querySelector('#case-file')");
 const custom={id:'inventory-reference-test',title:'Inventory Evidence Review',story:'A warehouse team reviews stock requests. Each request provides demand evidence. Some records may refer to the same request. The team needs consistent recommendations. All source details must remain available to the student.',task:'Design a workflow to review the supplied stock requests and recommend a case-supported action.',requirements:'Compare documented demand. Treat duplicate requests as potential merges only when the evidence identifies a different existing record. Use human_review when uncertainty cannot be resolved.',decisions:['retain','merge','human_review'],items:[{id:'A-02',label:'West store stock request',text:'West store requests 40 units. Request reference WEST-40.'},{id:'A-10',label:'Second stock request',text:'West store requests 40 units. Request reference WEST-40; potentially the same request as A-02.'}],answer_key:[{item_id:'A-02',decision:'retain',planted:false,note:'TEST_ONLY_PRIVATE_GRADE'},{item_id:'A-10',decision:{type:'merge',target_record_id:'A-02'},planted:true,note:'TEST_ONLY_PRIVATE_GRADE'}],skill_tags:['Evidence review']};
 const customFile=path.join(profile,'inventory-materials.json');fs.writeFileSync(customFile,JSON.stringify(custom));await fileUpload(customFile);await wait("document.body?.textContent.includes('Case validated.')");await click('Continue');await wait("document.querySelector('.briefing-case-heading h2')?.textContent==='Inventory Evidence Review'");
 assert.equal(await evaluate("document.body.textContent.includes('TEST_ONLY_PRIVATE_GRADE')"),false);
 await evaluate("document.querySelector('#briefing-tab-materials').click()");await wait("document.querySelectorAll('.material-card').length===5");await setSearch('A-10');await wait("document.querySelectorAll('.material-card').length>=1");assert.equal(await evaluate("document.querySelector('.material-library').textContent.includes('A-10')"),true);
 await evaluate("document.querySelector('#briefing-tab-mission').click()");await click("I'm Ready to Build My Agent");await wait("document.body.textContent.includes('Build Your AI Agent')");await wait("document.querySelector('#stage-extract')");
 const draft='Find documented stock demand, request references, and possible duplicate evidence. Do not assume missing facts.';
 await evaluate("(()=>{const el=document.querySelector('#stage-extract');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(draft)+");el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");await wait("document.querySelector('#stage-extract').value==="+JSON.stringify(draft));
 async function drawer(stage){
  const before=await evaluate("document.querySelector('#stage-"+stage+"').value");await evaluate("document.querySelector('.builder-materials').open=true");await click('View Case Materials');await wait("document.querySelector('dialog.case-materials-drawer')?.open");await setSearch('');await setFilter('requirements');await wait("document.querySelectorAll('dialog .material-card').length===1");await evaluate("document.querySelector('dialog .material-card button').click()");await wait("document.querySelector('dialog .material-full-text')?.textContent.includes('documented demand')");await click('Close Document');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().width<=innerWidth"),true);assert.equal(await evaluate("document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1"),true);await screenshot('materials-drawer-'+stage+'-mobile');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait("!document.querySelector('dialog.case-materials-drawer')");
  assert.equal(await evaluate("document.querySelector('#stage-"+stage+"').value"),before);assert.equal(await evaluate("document.activeElement.textContent.includes('View Case Materials')"),true);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 }
 await drawer('extract');
 for(const [stage,title,next]of [['extract','Extract','Continue to Check'],['check','Check','Continue to Flag'],['flag','Flag','Review My Complete Agent']]){
  if(stage!=='extract')await drawer(stage);
  await click('Test My '+title+' Instructions');await wait("document.querySelector('.stage-test-output .test-badge.current')",60000);await click(next);if(stage==='extract')await wait("document.querySelector('#stage-check')");if(stage==='check')await wait("document.querySelector('#stage-flag')");
 }
 await wait("document.querySelectorAll('.agent-summary').length===3");assert.equal(await evaluate("document.querySelectorAll('.agent-summary .test-badge.current').length"),3);
 await evaluate("document.querySelector('.builder-materials').open=true");await click('Read case briefing');await wait("document.querySelector('#briefing-tab-mission').getAttribute('aria-selected')==='true'");await click("I'm Ready to Build My Agent");await wait("document.querySelectorAll('.agent-summary').length===3");assert.equal(await evaluate("document.querySelector('.agent-summary p').textContent"),draft);
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')||'[]').length"),0);
 console.log('Sample and non-hiring briefing tabs, full public materials, search/filter, exact IDs, full text, privacy, refresh persistence, keyboard focus, mobile drawer, preserved drafts, and all three real stage tests passed.');
}
main().catch(async error=>{console.error(error.message);await global.__labDebug?.();process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});

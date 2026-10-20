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
 let seq=0;const pending=new Map();const dialogs=[];
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.method==='Page.javascriptDialogOpening'){dialogs.push(value.params.message);socket.send(JSON.stringify({id:++seq,method:'Page.handleJavaScriptDialog',params:{accept:false}}));}if(value.method==='Runtime.exceptionThrown')console.error('Browser exception:',value.params.exceptionDetails.exception?.description||value.params.exceptionDetails.text);if(value.method==='Runtime.consoleAPICalled'&&value.params.type==='error')console.error('Browser console:',value.params.args.map(arg=>arg.value||arg.description).join(' ').slice(0,1500));if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}};
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

 const mock=String.raw`(()=>{
 const original=window.fetch;window.__requests=[];
 let state=JSON.parse(sessionStorage.getItem('lesson-test-server')||'{"runs":0,"reviews":{}}');
 const save=()=>sessionStorage.setItem('lesson-test-server',JSON.stringify(state));
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const source=()=>JSON.parse(sessionStorage.getItem('lesson-test-case'));
 const publicPersonas=[{id:'operations',name:'Alex Rivera',role:'Operations manager',initials:'AR',concern:'Reliable evidence',starters:['Which evidence needs attention?']},{id:'oversight',name:'Taylor Chen',role:'Risk reviewer',initials:'TC',concern:'Human oversight',starters:['Where is human review needed?']}];
 window.fetch=async(url,options)=>{
  if(typeof url==='string'&&url==='/api/stage-test'){
   const input=JSON.parse(options.body);window.__requests.push(input);
   const previous=['extract','check','flag'].slice(0,['extract','check','flag'].indexOf(input.stage));
   const value={id:crypto.randomUUID(),stage:input.stage,record_id:input.record_id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),output:input.stage==='extract'?JSON.stringify({candidate_experience:'3 years (part time)',supporting_evidence:'Source says \"three years\"; record A-02.',missing:null}):input.stage==='check'?'**Evidence**\n\n- Requirement compared (A-02).\n- Missing information remains uncertain.':JSON.stringify({decision:'advance',reason:'Mock practice reasoning.'}),steps:Object.fromEntries(Object.entries(input.steps).map(([key,value])=>[key,value.trim()])),upstream_ids:previous.map(name=>JSON.parse(input.upstream[name]).id),...(input.stage==='flag'?{decision:'advance',reason:'Mock practice reasoning.'}:{})};
   return json({...value,receipt:JSON.stringify(value)});
  }
  if(url==='/api/local-demo'){
   const input=JSON.parse(options.body),scenario=source().scenario;window.__requests.push(input);state.runs++;save();
   return json({id:crypto.randomUUID(),attempt_number:state.runs,created_at:new Date().toISOString(),steps:input.steps,accuracy:state.runs===1?60:80,mode:'demo',errors:0,planted_caught:1,planted_total:2,results:scenario.items.map((item,index)=>({item_id:item.id,label:item.label,decision:'advance',match:index<(state.runs===1?3:4),reason:'Mock run reasoning grounded in public evidence.',outputs:{extract:'Recorded facts for '+item.id,check:'Recorded evaluation for '+item.id,flag:'Recorded recommendation for '+item.id}}))});
  }
  if(url==='/api/attempt-learning'){
   const input=JSON.parse(options.body);window.__requests.push(input);return json({reflection:input.reflection||'',acknowledged_below_target:input.acknowledged_below_target||false,updated_at:new Date().toISOString()});
  }
  if(typeof url==='string'&&url.startsWith('/api/stakeholders/chat')){
   const input=options?.body?JSON.parse(options.body):null;const attemptId=input?.attempt_id||new URL(url,location.origin).searchParams.get('attempt_id');
   const attempt=JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).find(item=>item.id===attemptId);
   let review=state.reviews[attemptId];
   if(!review){review={review_id:crypto.randomUUID(),version:1,local:true,personas:publicPersonas,reflection:null,attempt:{attempt_id:attempt.id,attempt_number:attempt.attempt_number,scenario_title:source().scenario.title,steps:attempt.steps,accuracy:attempt.accuracy,sample_size:5,planted_caught:1,planted_total:2,matched:4,missed:1,errors:0,mode:'demo'},conversations:Object.fromEntries(publicPersonas.map(person=>[person.id,{id:crypto.randomUUID(),stakeholder_id:person.id,messages:[]}]))};state.reviews[attemptId]=review;}
   if(input){window.__requests.push(input);const thread=review.conversations[input.stakeholder_id];const msg=(role,content)=>({id:crypto.randomUUID(),role,content,created_at:new Date().toISOString()});
    if(input.action==='start')thread.messages.push(msg('assistant','What evidence supports your approach?'));
    if(input.action==='send'){thread.messages.push(msg('user',input.message),msg('assistant','Consider how you would verify that evidence.'));review.reflection=null;}
    if(input.action==='restart'){thread.messages=[];review.reflection=null;}
    if(input.action==='reflect'){const evidence={message_id:Object.values(review.conversations)[0].messages[1].id,quote:'Public evidence'};review.reflection={operational_concerns:[{text:'Check the evidence for each recommendation.',evidence:[evidence]}],risk_concerns:[],addressed:[],evidence_gaps:[],improvements:[{text:'Keep human oversight for uncertain cases.',evidence:[evidence]}]};}
    review.version++;
   }
   save();return json(review);
  }
  const response=await original(url,options);
  if(typeof url==='string'&&url.startsWith('/api/cases/')&&response.ok){const fixture=await response.clone().json();fixture.scenario.story+='\n\n'+('Original context: \"quoted evidence\" (A-02). '.repeat(30))+'\n\nLast original paragraph: preserve this conclusion.';sessionStorage.setItem('lesson-test-case',JSON.stringify(fixture));return json(fixture);}
  return response;
 };
 })()`;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});await evaluate(mock);
 async function setText(selector,value){await evaluate("(()=>{const el=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,"+JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));})()");}
 async function goStage(name){await evaluate("(()=>{const el=[...document.querySelectorAll('.builder-progress button')].find(el=>el.querySelector('strong').textContent==="+JSON.stringify(name)+");if(!el||el.disabled)throw Error('Stage locked');el.click();})()");}
 async function size(width,height=900){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No overflow at '+width);}
 async function screenshotTop(name){await evaluate('window.scrollTo(0,0)');await screenshot(name);}
 await wait("document.querySelector('#case-file')");assert.equal(await evaluate("document.querySelector('h1').textContent"),'Case Upload');
 await navigate('/workbench');await wait("document.querySelector('h1')?.textContent==='AI Agent Builder'");await click('Choose a case');await wait("document.querySelector('#case-file')");
 assert.equal(await evaluate("document.querySelectorAll('.journey-progress li').length"),5);
 assert.equal(await evaluate("document.querySelectorAll('.journey-step[aria-disabled=true]').length"),4);
 await evaluate("document.querySelector('.journey-step[href=\"/results\"]').click()");await wait("document.querySelector('.journey-notice')?.textContent.includes('Run your complete agent')");assert.equal(await evaluate('location.pathname'),'/');
 await screenshotTop('lesson-upload-desktop');await click('Try Sample Case');await wait("document.querySelector('.selected-case')");await click('Continue');await wait("document.querySelector('#briefing-tab-scenario')");
 const tabNames=['Case Upload','Scenario Briefing','AI Agent Builder','Feedback & Results','Stakeholders'];
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.journey-step strong')].map(el=>el.textContent)"),tabNames);
 assert.equal(await evaluate("document.querySelectorAll('.journey-step svg').length"),5);
 assert.equal(await evaluate("document.querySelectorAll('.briefing-tabs [role=tab]').length"),3);
 assert.equal(await evaluate("document.querySelector('h1').textContent"),'Scenario Briefing');
 assert.equal(await evaluate("document.querySelector('.full-case-context').textContent===JSON.parse(sessionStorage.getItem('lesson-test-case')).scenario.story"),true);assert.equal(await evaluate("getComputedStyle(document.querySelector('.full-case-context')).maxHeight"),'none');assert.equal(await evaluate("document.querySelector('.full-case-context details')"),null);await screenshotTop('lesson-challenge-desktop');await size(390,844);await screenshotTop('lesson-challenge-mobile');await size(1440,1000);
 await click('View Full Case');await wait("document.querySelector('dialog')?.open");
 assert.equal(await evaluate("document.querySelectorAll('dialog .material-card').length"),8);
 await evaluate("document.querySelector('dialog .material-card button').click()");await wait("document.querySelector('dialog .material-full-text')");assert.equal(await evaluate("document.querySelector('dialog .material-full-text').textContent===JSON.parse(sessionStorage.getItem('lesson-test-case')).scenario.story"),true);await click('Close Document');
 await evaluate("document.querySelector('[aria-label=\"Close Case Materials\"]').click()");await wait("!document.querySelector('dialog')");
 await evaluate("document.querySelector('#briefing-tab-scenario').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await wait("document.querySelector('#briefing-tab-materials').getAttribute('aria-selected')==='true'");
 await wait("document.querySelectorAll('.material-card').length===8");
 await click('Next: Understand Your Mission');await wait("document.querySelector('.mission-workflow')");assert.equal(await evaluate("document.querySelector('.mission-reference details p').textContent===JSON.parse(sessionStorage.getItem('lesson-test-case')).scenario.requirements"),true);
 assert.equal(await evaluate("document.querySelectorAll('.mission-workflow>li').length"),3);
 await click("I'm Ready to Build My Agent");await wait("document.querySelector('#stage-extract')");
 assert.equal(await evaluate("document.querySelector('.stage-test-output')===null"),true);
 assert.equal(await evaluate("document.querySelector('.builder-help').open"),false);
 const draft='Find the stated evidence relevant to the case requirements and mark missing facts.';
 await setText('#stage-extract',draft);
 for(const [stage,title,next]of [['extract','Extract','Continue to Check'],['check','Check','Continue to Flag'],['flag','Flag','Review My Complete Agent']]){
  await wait("document.querySelector('#stage-"+stage+"')");await click('Test My '+title+' Instructions');await wait("document.querySelector('.stage-test-output .test-badge.current')");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.stage-test-output>.output-section>h4')].map(el=>el.textContent)"),['AI output','Evaluation feedback','Improvement guidance']);assert.equal(await evaluate("[...document.querySelectorAll('.stage-test-output .output-original')].every(el=>!el.open)"),true);if(stage==='extract'){assert.equal(await evaluate("document.querySelector('.stage-test-output .output-fields').textContent.includes('3 years (part time)')"),true);}await evaluate("document.querySelector('.stage-test-output').scrollIntoView({block:'start'})");await screenshot('lesson-output-'+stage);if(stage==='flag')assert.equal(await evaluate("document.querySelectorAll('.stage-test-output .decision-output>.ai-output .output-prose p').length"),1);await screenshotTop('lesson-builder-'+stage);await click(next);
 }
 await wait("document.querySelectorAll('.agent-summary').length===3");assert.equal(await evaluate("document.querySelectorAll('.review-stage-output').length"),3);await evaluate("document.querySelector('.agent-summary').open=true;document.querySelector('.review-stage-output').open=true");assert.equal(await evaluate("document.querySelector('.review-stage-output .output-fields').textContent.includes('3 years (part time)')"),true);await screenshotTop('lesson-builder-final-review');
 await goStage('Extract');assert.equal(await evaluate("document.querySelector('#stage-extract').value"),draft);
 await click('Back to Scenario');await wait("document.querySelector('#briefing-tab-mission')");await click("I'm Ready to Build My Agent");await wait("document.querySelector('#stage-extract')");
 assert.equal(await evaluate("document.querySelector('#stage-extract').value"),draft);await goStage('Final Review');await click('Run My Complete Agent');await wait("document.querySelector('.run-result-summary')");assert.equal(await evaluate("document.querySelector('h1').textContent"),'Feedback & Results');
 assert.equal(await evaluate("document.querySelector('.run-result-summary h2').textContent"),'60%');await screenshotTop('lesson-results-desktop');await size(390,844);await screenshotTop('lesson-results-mobile');await size(1440,1000);
 assert.equal(await evaluate("document.querySelector('a[href=\"/stakeholders\"]').getAttribute('aria-disabled')"),'true');
 await click('Investigate My Results');await wait("document.querySelectorAll('.investigation-card').length===2");await click('Investigate this record');await click('Inspect all stage outputs');await wait("document.querySelector('dialog')?.open");assert.equal(await evaluate("document.querySelectorAll('.trace-stage>.output-section').length"),3);await click('Close inspection');await click('Next: Improve My Agent');await wait("document.querySelector('#improvement-reflection')");
 assert.equal(await evaluate("document.querySelector('.improvement-guide').open"),false);await evaluate("document.querySelector('.improvement-guide').open=true");assert.equal(await evaluate("document.querySelectorAll('.improvement-area dl').length"),3);assert.ok(await evaluate("document.querySelector('.improvement-guide').textContent.includes('What may need attention')"));await evaluate("document.querySelector('.improvement-guide').open=false");
 await setText('#improvement-reflection','I will clarify how to handle missing evidence and compare the resulting outputs.');await click('Save Reflection');await wait("document.querySelector('.learning-status')?.textContent.includes('Reflection saved')");await screenshotTop('lesson-improve-desktop');
 await click('Return to Agent Builder & Improve My Instructions');await wait("document.querySelectorAll('.agent-summary').length===3");await click('Run My Complete Agent');await wait("document.querySelector('.run-result-summary h2')?.textContent==='80%'");
 await evaluate("document.querySelector('#results-tab-improve').click()");await wait("document.querySelector('#improvement-reflection')");await click('Continue to Stakeholder Review');await wait("document.querySelectorAll('.stakeholder-card').length===2");assert.equal(await evaluate("document.querySelector('h1').textContent"),'Stakeholders');await wait("document.querySelectorAll('.chat-message').length>0");
 assert.equal(await evaluate("document.querySelector('.performance-panel').open"),false);await evaluate("document.querySelector('.stakeholder-profiles').open=true");assert.ok(await evaluate("document.querySelector('.stakeholder-profiles').textContent.includes('Alex Rivera')&&document.querySelector('.stakeholder-profiles').textContent.includes('Reliable evidence')&&document.querySelector('.stakeholder-profiles').textContent.includes('Taylor Chen')"));await evaluate("document.querySelector('.stakeholder-profiles').open=false");await screenshotTop('lesson-stakeholders-desktop');
 for(let i=0;i<2;i++){
  await evaluate('document.querySelectorAll(".stakeholder-card")['+i+'].click()');await wait("document.querySelectorAll('.chat-message').length>0");await setText('#stakeholder-message','I used public evidence and would keep human review for uncertain decisions.');await click('Send');await wait("document.querySelectorAll('.chat-message').length>=3");
 }
 await click('Restart');await wait("document.querySelector('.restart-dialog')?.open");await click('Keep conversation');await wait("!document.querySelector('.restart-dialog')");
 await size(390,844);await screenshotTop('lesson-stakeholders-mobile');await size(1440,1000);await click('Finish Stakeholder Review');await wait("document.querySelector('.stakeholder-reflection')?.textContent.includes('Simulation review complete')");await screenshotTop('lesson-complete-desktop');
 assert.equal(await evaluate("document.querySelector('.attempt-takeaways').textContent.includes('Accuracy rose by 20')"),true);
 assert.equal(await evaluate("document.querySelector('.attempt-takeaways').textContent.includes('A successful test shows that the AI ran')"),true);
 await send('Page.reload');await wait("document.querySelector('.stakeholder-reflection')?.textContent.includes('Simulation review complete')");
 for(const width of [1024,768,390,320]){await size(width,900);assert.deepEqual(await evaluate("[...document.querySelectorAll('.journey-step strong')].map(el=>el.textContent)"),tabNames);assert.equal(await evaluate("[...document.querySelectorAll('.stakeholder-card>p')].every(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0)"),true);await screenshotTop('lesson-complete-'+width);}
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('agent-workbench.local-demo.v1')).length"),2);
 await navigate('/');await wait("document.querySelector('.selected-case')");await evaluate("document.querySelector('.case-choices').open=true");
 const switchFile=path.join(profile,'cancel-switch.json');fs.writeFileSync(switchFile,JSON.stringify({...JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8')),id:'different-case',title:'Do not select this case'}));
 await fileUpload(switchFile);await until(()=>dialogs.some(message=>message.includes('Switch to a different case')));
 assert.equal(await evaluate("document.querySelector('.selected-case h2').textContent"),'Screening analyst applications');
 await navigate('/workbench');await wait("document.querySelectorAll('.agent-summary').length===3");
 assert.equal(await evaluate("document.querySelector('.agent-summary p').textContent"),draft);
 console.log('Guided journey passed: case selection, challenge onboarding, keyboard case details, all builder stages, saved drafts/tests, two scored fixtures, evidence inspection, reflection gate, stakeholder handoff, restart confirmation, completion summary, refresh and responsive layouts. AI and scoring responses are mocked; no credits used.');
}
main().catch(async error=>{console.error(error.stack);try{await global.__labDebug?.();}catch{}process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});

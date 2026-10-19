'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useLab} from './FlowProvider';
import {DecisionLabel,EmptyCase,Icon,PageHeading} from './ui';
import {currentTest,stageOrder,type StageName,type StageTest} from '@/lib/builder-progress';
import {stages} from './builder-learning';
import {CaseMaterialsDrawer} from './CaseMaterials';
export {stages} from './builder-learning';

export function Builder(){
 const lab=useLab();
 const [materialsOpen,setMaterialsOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[seconds,setSeconds]=useState(0);
 const lock=useRef(false),mounted=useRef(true),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!lab.running){setSeconds(0);return;}const start=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[lab.running]);
 if(!lab.reference)return <EmptyCase/>;
 const {scenario,case_id}=lab.reference,progress=lab.builder,view=progress.view==='intro'?'extract':progress.view;
 const record=scenario.items.find(item=>item.id===progress.record_id)||scenario.items[0];
 const stage=stages.find(stage=>stage.id===view);
 const tests=Object.fromEntries(stageOrder.map(name=>[name,currentTest(progress,lab.steps,name)])) as Record<StageName,StageTest|undefined>;
 const ready=stageOrder.every(name=>tests[name]);
 const blocked=busy||lab.running;
 function navigate(next:typeof view){lab.editBuilder({...progress,view:next});setError('');setTimeout(()=>heading.current?.focus(),0);}
 async function test(){
  if(!stage||lock.current||lab.running)return;
  lock.current=true;setBusy(true);setError('');
  const snapshot={...lab.steps},previous=Object.fromEntries(stageOrder.slice(0,stageOrder.indexOf(stage.id)).map(name=>[name,tests[name]?.receipt]));
  try{
   const response=await fetch('/api/stage-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id,record_id:record.id,stage:stage.id,steps:snapshot,upstream:previous,request_id:crypto.randomUUID()})});
   const body=await response.json();if(!response.ok)throw Error(response.status===429?'AI testing is busy or its credits are unavailable. Wait a moment and retry; if it continues, contact your instructor.':response.status===401||response.status===403?'Your session or access needs attention. Sign in again or ask your instructor for help.':response.status>=500?'AI testing is unavailable right now. Try again shortly; if it continues, contact your instructor.':body.error||'This test could not finish. Check your instructions and earlier tests, then retry.');
   lab.editBuilder({...progress,tests:{...progress.tests,[stage.id]:[body as StageTest,...progress.tests[stage.id]].slice(0,3)}});
  }catch(error){if(mounted.current)setError((error instanceof TypeError?'Could not connect. Check your connection and try again.':error instanceof Error&&!(error instanceof SyntaxError)?error.message:'The test could not finish. Please try again.')+' Your instructions are saved.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 const next=stage?.id==='extract'?'check':stage?.id==='check'?'flag':'review';
 const prerequisite=stage?stageOrder.slice(0,stageOrder.indexOf(stage.id)).find(name=>!tests[name]):undefined;
 const summary=scenario.task.length>120?scenario.task.slice(0,117).replace(/\s+\S*$/,'')+'…':scenario.task;
 return <div className="simple-builder">
 <PageHeading step="03 / AI AGENT BUILDER" title="Build Your AI Agent" description="Write instructions. Test one record. Improve and continue."/>
 <section className="builder-challenge" aria-label="Your challenge"><span className="eyebrow">YOUR CHALLENGE</span><h2>{scenario.title}</h2><p>{summary}</p>
 <details className="builder-materials"><summary>Case details &amp; materials</summary><div><p>{scenario.task}</p><button className="button secondary" onClick={()=>setMaterialsOpen(true)}><Icon name="file" size={16}/> View Case Materials</button><Link href="/scenario" className="text-link">Read case briefing <Icon name="arrow" size={15}/></Link></div></details></section>
 <nav className="builder-progress" aria-label="Agent building stages"><ol>{[...stageOrder,'review' as const].map((name,index)=>{
  const passed=name!=='review'&&Boolean(tests[name]);
  // Keep previously visited stages available for review, even if retesting is needed.
  const unlocked=index===0||stageOrder.slice(0,Math.min(index,3)).every(previous=>progress.tests[previous].some(test=>test.record_id===record.id));
  return <li key={name}><button disabled={blocked||!unlocked} aria-current={view===name?'step':undefined} aria-label={`${index+1}. ${name==='review'?'Final Review':stages[index].title}${passed?', test complete':''}${!unlocked?', complete earlier tests first':''}`} className={view===name?'builder-step current':passed?'builder-step tested':'builder-step'} onClick={()=>navigate(name)}><span aria-hidden="true">{passed?<Icon name="check" size={14}/>:index+1}</span><strong>{name==='review'?'Final Review':stages[index].title}</strong></button></li>;
 })}</ol></nav>
 <section className="builder-workspace" aria-labelledby="builder-stage-heading" aria-busy={blocked}>
 <header className="builder-stage-header"><div><span className="eyebrow">STEP {view==='review'?4:stageOrder.indexOf(view)+1} OF 4</span><h2 id="builder-stage-heading" ref={heading} tabIndex={-1}>{view==='review'?'Final Review':stage?.heading}</h2><p>{view==='review'?'Review your three instructions, then run your agent on the full case.':stage?.subtitle}</p></div>
 <details className="builder-help" key={view}><summary>Need help?</summary><div>{stage?<><h3>Try this approach</h3><p>{stage.lesson}</p><h3>Example method</h3><p>{stage.id==='extract'?'Ask for evidence relevant to the case criteria and where it appears. Mark information that is missing.':stage.id==='check'?'Compare each requirement with the extracted evidence. Separate supported, unclear, and missing evidence.':'Connect an allowed action to evaluated evidence. Include an exact record ID when the action requires a target.'}</p><h3>Thinking prompts</h3><ul>{stage.questions.map(question=><li key={question}>{question}</li>)}</ul><h3>Common mistake</h3><p>{stage.mistake}</p></>:<><h3>Your connected workflow</h3><p>Extract finds facts. Check evaluates evidence. Flag recommends an action. The full run applies these instructions to every record and shows your performance in Results.</p><p>Editing instructions, changing records, or an expired test means you need to retest that stage and those after it.</p></>}<p className="small">Guidance suggests a method, not grading answers. You decide what to write.</p></div></details></header>
 {view==='review'?<>
 <div className="review-instructions"><h3>Your instructions</h3>{stages.map(item=><details className="agent-summary" key={item.id}><summary><strong>{item.title}</strong><span className={tests[item.id]?'test-badge current':'test-badge'}>{tests[item.id]?'Test complete':'Retest needed'}</span></summary><div><p>{lab.steps[item.id]||'No instructions yet.'}</p><button className="text-button" disabled={blocked} onClick={()=>navigate(item.id)}>Edit {item.title} instructions</button></div></details>)}</div>
 {!ready&&<div className="stale-test" role="status">Your instructions need fresh tests before a full run. <button className="text-button" disabled={blocked} onClick={()=>navigate(stageOrder.find(name=>!tests[name])!)}>Retest {stages.find(item=>item.id===stageOrder.find(name=>!tests[name]))?.title}</button></div>}
 {lab.needsReflection&&<div className="alert" role="status">Save a reflection on your latest attempt before running again. <Link href="/results" className="text-link">Open Results</Link></div>}
 <div className="builder-run-summary"><h3>Run on all {scenario.items.length} records</h3><p>{lab.demo?'The full run uses demo mode. Practice tests use real AI.':'The full run uses real AI and API credits.'} Your score and feedback will appear in Results.</p></div>
 <button className="button primary" disabled={blocked||!ready||lab.needsReflection} onClick={()=>void lab.run()}>{lab.running?'Processing…':'Run My Complete Agent'}<Icon name="arrow" size={17}/></button>
 </>:stage&&<>
 <div className="test-record-picker"><label htmlFor="practice-record">Practice record</label><select id="practice-record" value={record.id} disabled={blocked} aria-describedby="record-help" onChange={event=>{lab.editBuilder({...progress,record_id:event.target.value});setError('');}}>{scenario.items.map(item=><option key={item.id} value={item.id}>{item.id} / {item.label}</option>)}</select><small id="record-help">Changing records requires new tests for all three stages.</small></div>
 <details className="stage-input" key={"inputs-"+stage.id}><summary>View {stage.id==='extract'?'original record':'inputs for this stage'}</summary>{stage.id==='extract'?<pre>{record.text}</pre>:<>{stage.id==='check'&&<><h3>Case requirements</h3><p>{scenario.requirements}</p></>}{stageOrder.slice(0,stageOrder.indexOf(stage.id)).map(name=><section key={name}><h3>{name==='extract'?'Extract':'Check'} output</h3><pre>{tests[name]?.output||'Test this earlier stage to see its output.'}</pre></section>)}</>}</details>
 {stage.id==='flag'&&<div className="allowed-actions"><h3>Allowed decisions</h3><div className="decision-list">{scenario.decisions.map(value=><DecisionLabel key={value} value={value}/>)}</div><small>Targeted actions need the exact ID of a different, existing record.</small></div>}
 <div className="focused-editor"><label htmlFor={'stage-'+stage.id}>Your {stage.title.toLowerCase()} instructions</label><textarea id={'stage-'+stage.id} value={lab.steps[stage.id]} rows={6} minLength={10} maxLength={1500} disabled={blocked} aria-describedby="instruction-help" placeholder={stage.placeholder} onChange={event=>lab.editSteps({...lab.steps,[stage.id]:event.target.value})}/><small id="instruction-help">{lab.steps[stage.id].length.toLocaleString()} / 1,500 characters · Minimum 10</small></div>
 {progress.tests[stage.id].length>0&&!tests[stage.id]&&<div className="stale-test" role="status">Test again: your instructions, record, or an earlier test changed, or this test expired. Your earlier results are saved below.</div>}
 {prerequisite&&<p className="builder-prerequisite" role="status">Test {stages.find(item=>item.id===prerequisite)?.title} first to use its current output. <button className="text-button" disabled={blocked} onClick={()=>navigate(prerequisite)}>Go to {stages.find(item=>item.id===prerequisite)?.title}</button></p>}
 {error&&<div className="alert" role="alert">{error}</div>}
 <div className="stage-test-action"><button className={'button '+(tests[stage.id]?'secondary':'primary')} disabled={blocked||lab.steps[stage.id].trim().length<10||Boolean(prerequisite)} onClick={()=>void test()}>{busy?'Testing…':`Test My ${stage.title} Instructions`}</button><small>Practice only · Real AI and API credits · No grade</small></div>
 <StageTestOutput key={"output-"+stage.id} stage={stage} latest={tests[stage.id]} history={progress.tests[stage.id]}/>
 <div className="stage-next">{tests[stage.id]?<><span>Test complete. Check the result, then continue.</span><button className="button primary" disabled={blocked} onClick={()=>navigate(next)}>{stage.id==='flag'?'Review My Complete Agent':stage.id==='extract'?'Continue to Check':'Continue to Flag'}<Icon name="arrow" size={17}/></button></>:<small>Successfully test this stage to continue.</small>}</div>
 </>}
 </section>
 {materialsOpen&&<CaseMaterialsDrawer scenario={scenario} local={lab.local} storageKey={'agent-lab.materials.v1.'+(lab.local?'local':lab.user?.id)+'.'+case_id} onClose={()=>setMaterialsOpen(false)}/>}
 {lab.running&&<section className="run-progress" role="status" aria-live="polite"><span className="spinner"/><div><strong>Running your agent on {scenario.items.length} records</strong><p>Extract / Check / Flag · {seconds}s elapsed</p><small>Keep this page open. Results will appear when the run finishes.</small></div></section>}
 <div className="page-actions"><Link href="/scenario" className={'text-link '+(blocked?'link-disabled':'')} aria-disabled={blocked} onClick={event=>{if(blocked)event.preventDefault();}}><Icon name="back" size={16}/> Back to Scenario</Link></div>
 </div>;
}

function StageTestOutput({stage,latest,history}:{stage:typeof stages[number];latest?:StageTest;history:StageTest[]}){
 if(!latest&&!history.length)return null;
 return <section className="stage-test-output" aria-label={stage.title+' test results'} aria-live="polite">{latest?<><h3>Test completed successfully</h3><span className="test-badge current">Practice test · Not graded</span><p className="test-output-meta">Record {latest.record_id} · {new Date(latest.created_at).toLocaleString()}</p><h3>{stage.id==='extract'?'What the AI extracted':stage.id==='check'?'How the AI evaluated the evidence':'What the AI recommended'}</h3>{latest.decision?<><DecisionLabel value={latest.decision}/><p className="practice-reason">{latest.reason}</p><details><summary>View structured output</summary><pre>{latest.output}</pre></details></>:<div className="readable-test-result">{latest.output}</div>}<div className="output-review"><strong>What to improve</strong><p>A successful test means the AI ran, not that its answer is correct. Check these points and revise if needed.</p><ul>{stage.review.map(question=><li key={question}>{question}</li>)}</ul></div></>:<h3>Earlier test results</h3>}
 {history.some(test=>test.id!==latest?.id)&&<details className="test-history"><summary>Earlier tests ({history.filter(test=>test.id!==latest?.id).length})</summary>{history.filter(test=>test.id!==latest?.id).map(test=><article key={test.id}><strong>{new Date(test.created_at).toLocaleString()} · Record {test.record_id}</strong><pre>{test.output}</pre><details><summary>Instructions used</summary><pre>{test.steps[stage.id]}</pre></details></article>)}</details>}</section>;
}

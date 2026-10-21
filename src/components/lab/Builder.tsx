'use client';
import {VisibleChoices} from './VisibleChoices';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useLab} from './FlowProvider';
import {DecisionLabel,EmptyCase,Icon,PageHeading} from './ui';
import {instructionFields,combinedInstructions,instructionProblems,prepareAgentTests,type IncompleteRun} from '@/lib/combined-builder';
import {stageOrder} from '@/lib/builder-progress';
import {CaseMaterialsDrawer} from './CaseMaterials';
import {LessonFrame} from './LearningLayout';
import {AiOutput,DecisionOutput} from './AiOutput';
import {BuilderResults,RunRecords} from './BuilderResults';
export {stages} from './builder-learning';

export function Builder(){
 const lab=useLab(),[materialsOpen,setMaterialsOpen]=useState(false),[incomplete,setIncomplete]=useState<IncompleteRun|null>(null),[seconds,setSeconds]=useState(0),[reviewRequested,setReviewRequested]=useState(false);
 const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(!lab.running){setSeconds(0);return;}const start=Date.now(),timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[lab.running]);
 if(!lab.reference)return <LessonFrame step="03 / AI AGENT BUILDER" title="AI Agent Builder" intro="Write, review, test, and improve your instructions."><EmptyCase/></LessonFrame>;
 const {scenario,case_id}=lab.reference,progress=lab.builder;
 // Saved review sessions reopen the editor; Review remains an explicit action in this visit.
 const view=progress.view==='review'&&reviewRequested?'review':progress.view==='results'&&(lab.active||incomplete)?'results':'write';
 const problems=instructionProblems(lab.steps),record=scenario.items.find(item=>item.id===progress.record_id)||scenario.items[0];
 function navigate(next:'write'|'review'|'results'){setReviewRequested(next==='review');lab.editBuilder({...progress,view:next});lab.setError('');setTimeout(()=>heading.current?.focus(),0);}
 async function test(){
  if(lock.current||lab.running||problems.length||lab.needsReflection)return;
  lock.current=true;setIncomplete(null);let prepared=progress;
  try{
   const outcome=await lab.run({stayInBuilder:true,beforeRun:async()=>{prepared=await prepareAgentTests({caseId:case_id,scenario,steps:{...lab.steps},progress:{...progress,record_id:record.id},onProgress:lab.editBuilder});}});
   if(outcome.kind==='complete')lab.editBuilder({...prepared,view:'results'});
   if(outcome.kind==='incomplete'){setIncomplete(outcome.detail);lab.editBuilder({...prepared,view:'results'});}
   if(outcome.kind!=='failed')setTimeout(()=>heading.current?.focus(),0);
  }finally{lock.current=false;}
 }
 return <div className="combined-builder">
 <PageHeading step="03 / AI AGENT BUILDER" title="AI Agent Builder" description="Tell your AI what to find, how to check it, and what to leave out."/>
 <div className="combined-case"><strong>{scenario.title}</strong><button className="text-button" disabled={lab.running} onClick={()=>setMaterialsOpen(true)}><Icon name="file" size={15}/> Case materials</button></div>
 <section className="combined-workspace" aria-busy={lab.running}>
 <header className="combined-heading"><div><h2 ref={heading} tabIndex={-1}>{view==='write'?'Build Your AI Agent':view==='review'?'Review Your AI Instructions':'How Did Your AI Perform?'}</h2><p>{view==='write'?'Write your instructions below. You can revise them after testing.':view==='review'?"Here's what your AI will follow when reviewing the case records.":'Use the results to decide what to improve.'}</p></div>

 </header>
 {view==='write'?<form onSubmit={event=>{event.preventDefault();if(!problems.length)navigate('review');else document.getElementById('instruction-'+problems[0].id)?.focus();}}>
 <div className="combined-fields">{instructionFields.map((field,index)=><section className="combined-field" key={field.id}><label htmlFor={'instruction-'+field.id}><span aria-hidden="true">{String(index+1).padStart(2,'0')}</span>{field.label}</label><p className="field-question" id={field.id+'-question'}>{field.question}</p><p className="field-explanation" id={field.id+'-description'}>{field.description}</p><p className="field-guidance" id={field.id+'-guidance'}>{field.guidance}</p><textarea id={'instruction-'+field.id} rows={3} value={lab.steps[field.id]} disabled={lab.running} placeholder={field.placeholder} aria-describedby={field.id+'-question '+field.id+'-description '+field.id+'-guidance'+(lab.steps[field.id].length>1500?' '+field.id+'-limit':'')} onChange={event=>lab.editSteps({...lab.steps,[field.id]:event.target.value})}/>{lab.steps[field.id].length>1500&&<p id={field.id+'-limit'} className="error-text">Your draft is saved. Shorten this field to the service limit of 1,500 characters before testing.</p>}</section>)}</div>
 <div className="combined-actions"><button type="submit" className="button primary" disabled={lab.running||problems.length>0}>Next: Review My Instructions<Icon name="arrow" size={17}/></button><button type="button" className="button secondary" disabled={lab.running||problems.length>0||lab.needsReflection} onClick={()=>void test()}>{lab.running?'Testing...':'Test My AI Agent'}</button>{problems.length>0&&<p className="combined-hint">{problems[0].message}</p>}</div></form>
 :view==='review'?<>
 <pre className="assembled-instructions" aria-label="Your combined instructions">{combinedInstructions(lab.steps)}</pre>
 {problems.length>0&&<p className="error-text" role="alert">{problems[0].message}</p>}
 {lab.needsReflection&&<p className="alert" role="status">Save a brief reflection on your latest result before testing again. <button className="text-button" onClick={()=>navigate('results')}>Review my results</button></p>}
 <p className="combined-hint">Tests all {scenario.items.length} case records against the existing rubric. {lab.demo?'The graded run is a demonstration, not a live AI assessment.':'This uses real AI and API credits.'}</p>
 <div className="combined-actions"><button className="button secondary" disabled={lab.running} onClick={()=>navigate('write')}>Back to Edit</button><button className="button primary" disabled={lab.running||problems.length>0||lab.needsReflection} onClick={()=>void test()}>{lab.running?'Testing…':'Test My AI Agent'}<Icon name="arrow" size={17}/></button></div>
 </>:incomplete?<div className="incomplete-run"><p role="alert">{incomplete.message}</p><RunRecords results={incomplete.results} records={scenario.items} graded={false}/><button className="button primary" onClick={()=>{setIncomplete(null);navigate('write');}}>Improve My Instructions</button><Link className="text-link" href="/results">Previous saved results</Link></div>:lab.active&&<BuilderResults key={lab.active.id} attempt={lab.active} onImprove={()=>navigate('write')}/>}
{view==='write'&&<section data-information className="combined-help"><h3 className="information-heading">Writing guidance</h3><div><p>Look For identifies relevant facts. Verify compares those facts with the evidence and case requirements. Don't Include explains what to ignore, what should not receive credit, and when a permitted action needs human review.</p><p>Ignoring information is different from rejecting a record. Use rejection or human review only when this case's rules support it. Write any metrics or thresholds in your own words; none are added for you.</p><p>The examples are placeholders, not answers. Each field accepts 10–1,500 characters for testing; longer drafts are kept so you can edit them.</p><h3>Allowed actions for this case</h3><div className="decision-list">{scenario.decisions.map(value=><DecisionLabel key={value} value={value}/>)}</div><p>Actions that need another record must use its exact existing ID, never their own ID.</p><VisibleChoices label="Readiness check record" id="practice-record" value={record.id} disabled={lab.running} onChange={event=>lab.editBuilder({...progress,record_id:event.target.value})}>{scenario.items.map(item=><option key={item.id} value={item.id}>{item.id} / {item.label}</option>)}</VisibleChoices><p>Your test checks this record first, then evaluates all {scenario.items.length} records. These checks use AI credits; the full run {lab.demo?'uses demonstration mode':'also uses AI credits'}.</p><section data-information><h4 className="information-heading">Previous readiness tests</h4>{stageOrder.map(stage=><section key={stage}><h4>{instructionFields.find(field=>field.id===stage)!.label}</h4>{progress.tests[stage].length?progress.tests[stage].map(test=><section data-information key={test.id}><h5 className="information-heading">{test.record_id} / {new Date(test.created_at).toLocaleString()}</h5>{test.decision?<DecisionOutput decision={test.decision} reason={test.reason} original={test.output}/>:<AiOutput value={test.output} showOriginal/>}<section data-information><h6 className="information-heading">Instructions used</h6><pre className="assembled-instructions">{combinedInstructions(test.steps)}</pre></section></section>):<p>No readiness tests yet.</p>}</section>)}</section></div></section>}
 {lab.running&&<div className="combined-running" role="status" aria-live="polite"><span className="spinner"/><p>Testing your instructions and reviewing the case records. {seconds}s elapsed. Keep this page open.</p></div>}
 </section>
 {materialsOpen&&<CaseMaterialsDrawer scenario={scenario} local={lab.local} storageKey={'agent-lab.materials.v1.'+(lab.local?'local':lab.user?.id)+'.'+case_id} onClose={()=>setMaterialsOpen(false)}/>}
 <div className="page-actions"><Link href="/scenario" className={'text-link '+(lab.running?'link-disabled':'')} aria-disabled={lab.running} onClick={event=>{if(lab.running)event.preventDefault();}}><Icon name="back" size={16}/> Back to Scenario</Link>{view!=='results'&&lab.active&&<button className="text-button" disabled={lab.running} onClick={()=>navigate('results')}>My previous results</button>}</div>
 </div>;
}

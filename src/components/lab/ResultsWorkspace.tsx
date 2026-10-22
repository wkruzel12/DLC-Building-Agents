'use client';
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {Attempt} from '@/lib/types';
import {instructionFields,instructionProblems} from '@/lib/combined-builder';
import {sampleReference} from '@/lib/record-review';
import {validReflection} from '@/lib/results-learning';
import {useLab} from './FlowProvider';
import {PerformanceDashboard} from './PerformanceDashboard';
import {RecordReview} from './RecordReview';
import {Icon} from './ui';
type Tab='results'|'investigate';
const tabs=[{id:'results',label:'Your Results'},{id:'investigate',label:'Investigate'}] as const;
export function ResultsWorkspace({attempt,onReview,builder=false}:{attempt:Attempt;onReview?:()=>void;builder?:boolean}){
 const lab=useLab(),router=useRouter(),[tab,setTab]=useState<Tab>('results'),[recordId,setRecordId]=useState(attempt.results.find(row=>!row.match)?.item_id||attempt.results[0]?.item_id||''),[reflection,setReflection]=useState(attempt.learning?.reflection||''),[ack,setAck]=useState(attempt.learning?.acknowledged_below_target||false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[restored,setRestored]=useState(false);
 const lock=useRef(false),reflectionInput=useRef<HTMLTextAreaElement>(null);
 const selected=attempt.results.find(row=>row.item_id===recordId)||attempt.results[0];
 const scenario=lab.reference&&(!attempt.case_id||attempt.case_id===lab.reference.case_id)?lab.reference.scenario:undefined;
 const reference=selected?sampleReference(scenario,attempt.records,selected.item_id):null;
 const ordered=[...lab.history].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.attempt_number-b.attempt_number),latest=ordered.at(-1),completed=Math.max(attempt.completed_count||0,ordered.length),below=attempt.accuracy<lab.target;
 const key='agent-lab.results.v1.'+(lab.local?'local':lab.user?.id)+':'+attempt.id,prefix=(builder?'builder':'feedback')+'-clean';
 useEffect(()=>{try{const saved=JSON.parse((lab.local?localStorage:sessionStorage).getItem(key)||'{}');setTab(saved.tab==='investigate'||saved.tab==='improve'?'investigate':'results');if(attempt.results.some(row=>row.item_id===saved.recordId))setRecordId(saved.recordId);if(typeof saved.reflection==='string')setReflection(saved.reflection.slice(0,1500));if(typeof saved.ack==='boolean')setAck(saved.ack);}catch{/* Use server defaults. */}setRestored(true);},[key,lab.local,attempt.results]);
 useEffect(()=>{if(!restored)return;try{(lab.local?localStorage:sessionStorage).setItem(key,JSON.stringify({tab,recordId,reflection,ack}));}catch{/* Keep editing usable. */}},[key,lab.local,restored,tab,recordId,reflection,ack]);
 function selectTab(next:Tab,focus=false){setTab(next);setError('');setMessage('');if(focus)setTimeout(()=>document.getElementById(prefix+'-tab-'+next)?.focus(),0);}
 function tabKeys(event:KeyboardEvent<HTMLButtonElement>,index:number){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();selectTab(tabs[event.key==='Home'?0:event.key==='End'?1:1-index].id,true);}
 async function saveReflection(){
  if(lock.current||!lab.reference)return false;
  if(below&&!ack&&!validReflection(reflection)){setError('Write one sentence about what you will change and why (at least 10 characters).');reflectionInput.current?.focus();return false;}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/attempt-learning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:lab.reference.case_id,attempt_id:attempt.id,action:'save',reflection,acknowledged_below_target:ack})});const value=await response.json();if(!response.ok)throw Error(value.error||'Your reflection could not be saved. Please retry.');if(typeof value.reflection!=='string'||below&&!ack&&!validReflection(value.reflection))throw Error('Your reflection was not confirmed. Please retry.');lab.updateAttemptLearning(attempt.id,value);setMessage('Reflection saved. Your revised instructions are ready to review.');return true;}catch(error){setError(error instanceof Error?error.message:'Could not save your reflection. Your draft is still here.');return false;}finally{lock.current=false;setBusy(false);}
 }
 async function review(){
  const problems=instructionProblems(lab.steps);if(problems.length){setError(problems[0].message);document.getElementById(prefix+'-instruction-'+problems[0].id)?.focus();return;}
  if(lab.needsReflection&&latest?.id!==attempt.id){setError('Save a reflection on your latest attempt before testing again. Choose that attempt in Your Results.');return;}
  if((lab.needsReflection||reflection!==attempt.learning?.reflection&&reflection.trim())&&!await saveReflection())return;
  if(onReview)onReview();else{lab.editBuilder({...lab.builder,view:'write'});router.push('/workbench');}
 }
 return <div className="clean-results-workspace">
 <div className="clean-results-tabs" role="tablist" aria-label="Results activities">{tabs.map((item,index)=><button type="button" id={prefix+'-tab-'+item.id} role="tab" aria-selected={tab===item.id} aria-controls={prefix+'-panel-'+item.id} tabIndex={tab===item.id?0:-1} onKeyDown={event=>tabKeys(event,index)} onClick={()=>selectTab(item.id)} key={item.id}>{item.label}</button>)}</div>
 <section id={prefix+'-panel-results'} role="tabpanel" aria-labelledby={prefix+'-tab-results'} hidden={tab!=='results'}>
 <div className="clean-attempt-heading"><h2>Your Results</h2><span>Attempt {attempt.completed_index||ordered.findIndex(row=>row.id===attempt.id)+1||attempt.attempt_number} · {new Date(attempt.created_at).toLocaleString()}</span></div>
 <PerformanceDashboard attempt={attempt} history={lab.history} target={lab.target} onSelect={row=>lab.selectAttempt(row,builder)}/>
 <button type="button" className="button primary" onClick={()=>selectTab('investigate',true)}>Investigate my results <Icon name="arrow" size={17}/></button>
 {lab.canReview&&<button type="button" className="button secondary clean-stakeholder-action" onClick={()=>lab.reviewAttempt(attempt)}>Continue to Stakeholder Review <Icon name="arrow" size={17}/></button>}
 </section>
 <section id={prefix+'-panel-investigate'} role="tabpanel" aria-labelledby={prefix+'-tab-investigate'} hidden={tab!=='investigate'}>
 <div className="clean-investigate-intro"><h2>See what your agent found.</h2><p>Compare the evidence, then revise your instructions.</p>{attempt.mode==='demo'&&<p className="clean-mode-note">Simulated attempt · {attempt.accuracy}% · {attempt.results.filter(row=>row.match).length} of {attempt.results.length} recommendations matched.</p>}</div>
 <div className="clean-record-choices" role="group" aria-label="Choose a record">{attempt.results.map(row=><button type="button" key={row.item_id} aria-pressed={selected?.item_id===row.item_id} onClick={()=>setRecordId(row.item_id)}><strong>{row.label}</strong><small>{row.error?'Processing error':row.match?'Matched':'Needs review'}</small></button>)}</div>
 {selected?<RecordReview attempt={attempt} result={selected} scenario={scenario}/>:<p>No record results were saved for this attempt.</p>}
 <section className="clean-card clean-prompt-editor"><h3>Improve your instructions</h3><p>{reference?.hint||'Clarify the instructions using the recorded evidence and case requirements.'}</p>
 {instructionFields.map(field=><div className="clean-edit-field" key={field.id}><label htmlFor={prefix+'-instruction-'+field.id}>{field.label}</label><textarea id={prefix+'-instruction-'+field.id} rows={3} maxLength={1500} disabled={!scenario||busy||lab.running} value={lab.steps[field.id]} onChange={event=>lab.editSteps({...lab.steps,[field.id]:event.target.value})}/></div>)}
 <div className="clean-reflection"><label htmlFor={prefix+'-reflection'}>What are you changing, and why?</label><textarea id={prefix+'-reflection'} ref={reflectionInput} rows={2} maxLength={1500} value={reflection} disabled={busy||lab.running} onChange={event=>setReflection(event.target.value)} placeholder="I will clarify… because…"/><small>{below?'One brief reflection is required before testing again.':'Optional reflection.'} Your draft instructions apply to every record in this case.</small></div>
 {below&&completed>=3&&<label className="clean-ack"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/> I understand this attempt is below the {lab.target}% target and want to discuss its limitations with stakeholders.</label>}
 {error&&<p className="error-text" role="alert">{error}</p>}{message&&<p className="success-text" role="status">{message}</p>}
 <div className="clean-edit-actions"><button type="button" className="button primary" disabled={!scenario||busy||lab.running} onClick={()=>void review()}>Review revised instructions <Icon name="arrow" size={17}/></button><button type="button" className="button secondary" disabled={!scenario||busy||lab.running} onClick={()=>void saveReflection()}>{busy?'Saving…':'Save reflection'}</button>{below&&completed>=3&&ack&&<button type="button" className="button secondary" disabled={busy||!scenario} onClick={async()=>{if(await saveReflection())lab.reviewAttempt({...attempt,learning:{...attempt.learning,reflection,acknowledged_below_target:ack}});}}>Continue to Stakeholder Review</button>}</div>
 <p className="clean-edit-note">Your edits are saved as a draft. This attempt and its score stay unchanged until you run another test.</p>
 </section></section></div>;
}

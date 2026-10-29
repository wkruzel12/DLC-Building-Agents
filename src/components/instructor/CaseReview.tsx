'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {caseChecks,toScenario,slugify,aiSkillLabel,type BuilderSetup,type EditableCase,type EditableRecord} from '@/lib/case-builder';
import {formatJoinCode} from '@/lib/roles';
import {Icon} from '../lab/ui';

type Props={setup:BuilderSetup;edit:EditableCase|null;setEdit:(next:EditableCase|null)=>void;reviewed:boolean;setReviewed:(value:boolean)=>void;onPublished:()=>void};
const label=(type:string)=>type.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());

export function CaseReview({setup,edit,setEdit,reviewed,setReviewed,onPublished}:Props){
 const [busy,setBusy]=useState<'generate'|'publish'|null>(null),[error,setError]=useState(''),[published,setPublished]=useState<{code:string;title:string}|null>(null);
 const checks=useMemo(()=>edit?caseChecks(edit,setup):[],[edit,setup]);
 const errors=checks.filter(c=>c.level==='error'),warnings=checks.filter(c=>c.level==='warning');
 const confirmed=setup.outcomes.filter(o=>o.confirmed).length;

 function change(mutate:(draft:EditableCase)=>void){if(!edit)return;const draft=structuredClone(edit);mutate(draft);setEdit(draft);setReviewed(false);}
 async function generate(){
  if(edit&&!window.confirm('Generate a new draft? Your current edits to this case will be replaced.'))return;
  setBusy('generate');setError('');
  try{
   const response=await fetch('/api/instructor/builder/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setup})});
   const body=await response.json();if(!response.ok)throw Error(body.error||'Could not generate the case.');
   setEdit(body.case as EditableCase);setReviewed(false);
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not generate the case.');}
  finally{setBusy(null);}
 }
 async function publish(){
  if(!edit)return;setBusy('publish');setError('');
  try{
   const response=await fetch('/api/instructor/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edit,setup,reviewed})});
   const body=await response.json();if(!response.ok)throw Error(body.error||'Could not publish the case.');
   setPublished({code:body.join_code,title:edit.title});onPublished();
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not publish the case.');}
  finally{setBusy(null);}
 }
 function download(){
  if(!edit)return;
  const blob=new Blob([JSON.stringify(toScenario(edit,setup,slugify(edit.title)),null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=slugify(edit.title)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 }

 if(published)return <section className="pb-published" aria-live="polite">
  <span className="selection-check"><Icon name="check" size={22}/></span>
  <h3>“{published.title}” is published</h3>
  <p>Share this join code with your class. Students enter it on the Case Upload page.</p>
  <strong className="join-code large">{formatJoinCode(published.code)}</strong>
  <div className="pb-inline"><Link className="button primary" href="/instructor">Go to class dashboard</Link><button type="button" className="button secondary" onClick={()=>{setPublished(null);}}>Build another case</button></div>
 </section>;

 if(!edit)return <div className="pb-step">
  <p className="pb-lead">Proofwork will draft the full case: context, criteria, {setup.design.recordCount} records, a private answer key with notes, and two stakeholders. You'll review and edit everything before students see it.</p>
  <dl className="pb-summary">
   <div><dt>Course</dt><dd>{setup.course.name||'Not set'}{setup.course.discipline?' · '+setup.course.discipline:''}</dd></div>
   <div><dt>Confirmed outcomes</dt><dd>{confirmed||'None yet. Confirm at least one in step 2.'}</dd></div>
   <div><dt>AI skills</dt><dd>{setup.aiSkills.map(aiSkillLabel).join(', ')||'None selected'}</dd></div>
   <div><dt>Records</dt><dd>{setup.design.recordCount} {setup.design.recordDetail}, {setup.design.plantedCount} planted, {setup.design.difficulty}</dd></div>
   <div><dt>Actions</dt><dd>{setup.design.decisions.map(d=>label(d.type)).join(', ')}</dd></div>
  </dl>
  <div className="pb-inline"><button type="button" className="button primary" disabled={busy!==null||confirmed===0} onClick={()=>void generate()}>{busy==='generate'?'Drafting your case…':'Generate case draft'}</button>{busy==='generate'&&<span className="pb-help" role="status">Larger, detailed cases can take two to three minutes. Keep this tab open.</span>}</div>
  {error&&<p className="pb-message error-text" role="alert">{error}</p>}
  <p className="pb-help">Uses AI credits. You can also edit records by hand after drafting.</p>
 </div>;

 const typeOptions=edit.decisions.map(d=>d.type);
 const needsTarget=(type:string)=>edit.decisions.find(d=>d.type===type)?.requires_target||type==='merge';
 const updateRecord=(index:number,patch:Partial<EditableRecord>)=>change(draft=>{Object.assign(draft.records[index],patch);});
 return <div className="pb-step pb-review">
  <div className="pb-review-bar">
   <span className={errors.length?'pb-status pb-status-error':'pb-status pb-status-ok'}>{errors.length?`${errors.length} to fix`:'Ready to publish'}{warnings.length?` · ${warnings.length} suggestion${warnings.length===1?'':'s'}`:''}</span>
   <div className="pb-inline"><button type="button" className="button secondary" onClick={download}>Download JSON</button><button type="button" className="button secondary" disabled={busy!==null} onClick={()=>void generate()}>{busy==='generate'?'Drafting…':'Regenerate'}</button></div>
  </div>
  {error&&<p className="pb-message error-text" role="alert">{error}</p>}

  {checks.length>0&&<section className="pb-checks" aria-label="Case checks"><ul>{checks.map((check,index)=><li key={index} className={'pb-check-'+check.level}><span className="pb-dot" aria-hidden="true"/><span className="visually-hidden">{check.level==='error'?'Must fix: ':'Suggestion: '}</span>{check.message}</li>)}</ul></section>}

  <section className="pb-section">
   <h3>Case basics</h3>
   <div className="pb-field"><label htmlFor="case-title">Title</label><input id="case-title" className="input" value={edit.title} maxLength={180} onChange={event=>change(d=>{d.title=event.target.value;})}/></div>
   <div className="pb-field"><label htmlFor="case-story">Context <small>students see this</small></label><textarea id="case-story" className="input" rows={6} value={edit.story} maxLength={12000} onChange={event=>change(d=>{d.story=event.target.value;})}/></div>
   <div className="pb-field"><label htmlFor="case-task">Student task <small>includes your questions and prompting requirements</small></label><textarea id="case-task" className="input" rows={6} value={edit.task} maxLength={6000} onChange={event=>change(d=>{d.task=event.target.value;})}/></div>
   <div className="pb-field"><label htmlFor="case-req">Evaluation criteria <small>students see this; the agent checks every record against it</small></label><textarea id="case-req" className="input" rows={6} value={edit.requirements} maxLength={12000} onChange={event=>change(d=>{d.requirements=event.target.value;})}/></div>
   <p className="pb-help">Allowed actions: {edit.decisions.map(d=>label(d.type)).join(', ')}. Change them in step 4.</p>
  </section>

  <section className="pb-section">
   <div className="pb-section-head"><h3>Records and expected decisions <small>{edit.records.length} records · {edit.records.filter(r=>r.planted).length} planted</small></h3>
    <button type="button" className="button secondary" disabled={edit.records.length>=20} onClick={()=>change(d=>{const next=d.records.length+1;let id='r'+String(next).padStart(2,'0');while(d.records.some(r=>r.id===id))id+='b';d.records.push({id,label:'New record',text:'',expected:typeOptions[0]||'',target:'',planted:false,note:''});})}>Add record</button></div>
   <ol className="pb-records">{edit.records.map((record,index)=><li key={index}>
    <details open={edit.records.length<=6}>
     <summary><span className="pb-record-id">{record.id}</span><strong>{record.label||'Untitled record'}</strong><span className="pb-record-expect">{record.expected?label(record.expected):'No decision'}{record.target?' → '+record.target:''}</span>{record.planted&&<span className="pb-planted">Planted</span>}</summary>
     <div className="pb-record-body">
      <div className="pb-grid-3">
       <div className="pb-field"><label htmlFor={'rid-'+index}>Record ID</label><input id={'rid-'+index} className="input" value={record.id} maxLength={100} onChange={event=>updateRecord(index,{id:event.target.value.replace(/\s/g,'')})}/></div>
       <div className="pb-field pb-span-2"><label htmlFor={'rlabel-'+index}>Display name</label><input id={'rlabel-'+index} className="input" value={record.label} maxLength={200} onChange={event=>updateRecord(index,{label:event.target.value})}/></div>
      </div>
      <div className="pb-field"><label htmlFor={'rtext-'+index}>Record text <small>students and the agent see this</small></label><textarea id={'rtext-'+index} className="input" rows={6} value={record.text} maxLength={12000} onChange={event=>updateRecord(index,{text:event.target.value})}/></div>
      <div className="pb-grid-3">
       <div className="pb-field"><label htmlFor={'rexp-'+index}>Expected decision <small>private</small></label><select id={'rexp-'+index} className="input" value={record.expected} onChange={event=>updateRecord(index,{expected:event.target.value,target:needsTarget(event.target.value)?record.target:''})}>{!typeOptions.includes(record.expected)&&<option value={record.expected}>{record.expected?label(record.expected)+' (not allowed)':'Choose…'}</option>}{typeOptions.map(type=><option key={type} value={type}>{label(type)}</option>)}</select></div>
       {needsTarget(record.expected)&&<div className="pb-field"><label htmlFor={'rtarget-'+index}>Target record</label><select id={'rtarget-'+index} className="input" value={record.target} onChange={event=>updateRecord(index,{target:event.target.value})}><option value="">Choose…</option>{edit.records.filter(r=>r.id!==record.id).map(r=><option key={r.id} value={r.id}>{r.id} · {r.label}</option>)}</select></div>}
       <label className="pb-check pb-check-field"><input type="checkbox" checked={record.planted} onChange={event=>updateRecord(index,{planted:event.target.checked})}/> Planted (tests a specific skill)</label>
      </div>
      <div className="pb-field"><label htmlFor={'rnote-'+index}>Private note <small>why this answer is right, and what it tests</small></label><textarea id={'rnote-'+index} className="input" rows={2} value={record.note} maxLength={6000} onChange={event=>updateRecord(index,{note:event.target.value})}/></div>
      <button type="button" className="text-button pb-remove" disabled={edit.records.length<=1} onClick={()=>{if(window.confirm('Remove this record?'))change(d=>{d.records.splice(index,1);});}}>Remove record</button>
     </div>
    </details>
   </li>)}</ol>
  </section>

  <section className="pb-section">
   <h3>Stakeholders <small>students discuss their results with these two people</small></h3>
   <div className="pb-grid-2">{[0,1].map(index=>{const persona=edit.stakeholders[index]||{id:'stakeholder_'+(index+1),name:'',role:'',concern:'',personality:'',priorities:[],concerns:[],challenge_questions:[],starters:[]};
    const set=(patch:Partial<typeof persona>)=>change(d=>{while(d.stakeholders.length<=index)d.stakeholders.push({id:'stakeholder_'+(d.stakeholders.length+1),name:'',role:'',concern:'',personality:'',priorities:[],concerns:[],challenge_questions:[],starters:[]});Object.assign(d.stakeholders[index],patch);});
    return <fieldset key={index} className="pb-persona"><legend>Stakeholder {index+1}</legend>
     <div className="pb-field"><label htmlFor={'pname-'+index}>Name</label><input id={'pname-'+index} className="input" value={persona.name} maxLength={100} onChange={event=>set({name:event.target.value})}/></div>
     <div className="pb-field"><label htmlFor={'prole-'+index}>Role</label><input id={'prole-'+index} className="input" value={persona.role} maxLength={160} onChange={event=>set({role:event.target.value})}/></div>
     <div className="pb-field"><label htmlFor={'pconcern-'+index}>Main concern</label><textarea id={'pconcern-'+index} className="input" rows={2} value={persona.concern} maxLength={400} onChange={event=>set({concern:event.target.value})}/></div>
    </fieldset>;})}</div>
  </section>

  <details className="pb-preview">
   <summary>Preview what students see</summary>
   <div className="pb-preview-body">
    <h3>{edit.title||'Untitled case'}</h3>
    <h4>Context</h4><p>{edit.story}</p>
    <h4>Your task</h4><p>{edit.task}</p>
    <h4>Evaluation criteria</h4><p>{edit.requirements}</p>
    <h4>Records</h4>
    <ol>{edit.records.map(record=><li key={record.id}><strong>{record.label}</strong><p>{record.text}</p></li>)}</ol>
    <p className="pb-help">Expected decisions, planted flags, and notes stay private.</p>
   </div>
  </details>

  <section className="pb-publish">
   <label className="pb-check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/> I reviewed every record's expected decision and the criteria support each one.</label>
   <div className="pb-inline"><button type="button" className="button primary" disabled={busy!==null||!reviewed||errors.length>0} onClick={()=>void publish()}>{busy==='publish'?'Publishing…':'Publish and get join code'}</button>
    {errors.length>0&&<span className="pb-help">Fix the items marked above to publish.</span>}</div>
  </section>
 </div>;
}

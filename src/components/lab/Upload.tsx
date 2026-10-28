'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {defaultSteps,useLab} from './FlowProvider';
import {Icon,PageHeading} from './ui';
import {CurrentObjective} from './LearningLayout';
import type {CaseReference} from '@/lib/types';
import {JoinCode} from './JoinCode';
import {useRole} from './useRole';

export function Upload(){
 const lab=useLab(),router=useRouter(),input=useRef<HTMLInputElement>(null);
 const [file,setFile]=useState<{name:string;size:number}|null>(null),[status,setStatus]=useState<'idle'|'validating'|'valid'|'error'>('idle'),[message,setMessage]=useState(''),[dragging,setDragging]=useState(false);
 // Classroom mode: students join an instructor's case by code instead of uploading a file.
 const role=useRole(lab.user?.id),studentJoin=role.classroom&&!role.instructor;
 const valid=status==='valid'||(status==='idle'&&Boolean(lab.reference));
 function canSwitchCase(){
  const work=lab.builder.view!=='intro'||Boolean(lab.active)||Object.values(lab.builder.tests).some(tests=>tests.length>0)||(['extract','check','flag'] as const).some(stage=>lab.steps[stage]!==defaultSteps[stage]);
  return !lab.reference||!work||window.confirm('Switch to a different case? Your current case will no longer be selected. Review any work you need before switching; instructions and results are kept separately for each case.');
 }
 async function upload(selected:File){
  if(!canSwitchCase())return;
  setFile({name:selected.name,size:selected.size});setMessage('');setStatus('validating');
  const pdf=selected.name.toLowerCase().endsWith('.pdf');
  if(!pdf&&!selected.name.toLowerCase().endsWith('.json')){setStatus('error');setMessage('Choose a .pdf or .json case file. Other file formats are not supported.');return;}
  if(selected.size>1024*1024){setStatus('error');setMessage('This file is too large. The maximum size is 1 MB.');return;}
  try{
   const response=await fetch('/api/cases',{method:'POST',headers:{'Content-Type':pdf?'application/pdf':'application/json'},body:selected});
   const body=await response.json();if(!response.ok)throw Error([body.error,...(body.issues||[])].join(' '));
   lab.chooseCase(body as CaseReference);setStatus('valid');setMessage('Case validated. You’re ready to begin.');
  }catch(error){setStatus('error');setMessage(error instanceof Error?error.message:'Upload failed. Please retry.');}
 }
 async function sample(){if(!canSwitchCase())return;setMessage('');setStatus('validating');setFile(null);try{const response=await fetch('/api/cases/resume-screener',{cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error);lab.chooseCase(body);setStatus('valid');setMessage('Sample case ready. Five fictional records to explore.');}catch(error){setStatus('error');setMessage(error instanceof Error?error.message:'Could not load the sample case.');}}
 return <div className="lesson-page upload-lesson"><PageHeading step="STEP 1 / CHOOSE A CASE" title="Case Upload" description="Use your instructor’s case or explore the sample. We’ll guide you from there."/><CurrentObjective>{studentJoin?'Enter your instructor’s join code, or try the sample. Continue when your case is ready.':'Choose an instructor PDF or JSON case, or try the sample. Continue when your case is ready.'}</CurrentObjective>
 <div aria-live="polite" aria-atomic="true">{status==='validating'&&<div className="selection-status"><span className="spinner"/><div><strong>Preparing your case</strong><p>PDFs can take a little longer. Keep this page open.</p></div></div>}{message&&<p className={status==='error'?'upload-message error-text':'upload-message success-text'} role={status==='error'?'alert':'status'}>{message}</p>}</div>
 {file&&<div className={'file-status '+(status==='error'?'file-invalid':'')}><Icon name="file" size={20}/><div><strong>{file.name}</strong><small>{(file.size/1024).toFixed(1)} KB · {status==='validating'?'Reading your case…':valid?'File accepted':'File not accepted'}</small></div></div>}
 {valid&&lab.reference&&<section className="selected-case"><span className="selection-check"><Icon name="check" size={22}/></span><div><span className="eyebrow">CASE READY</span><h2>{lab.reference.scenario.title}</h2><p>{lab.reference.scenario.items.length} records · Your next step is to read the challenge.</p></div><button className="button primary" onClick={()=>router.push('/scenario')}>Continue<Icon name="arrow" size={17}/></button></section>}
 <section className="case-choices" key={valid?'selected':'choose'}><h3 className="always-visible-heading">{valid?'Choose a different case':'Choose how to begin'}</h3><div className="upload-grid">{studentJoin?<JoinCode disabled={status==='validating'} beforeJoin={canSwitchCase} onJoined={value=>{lab.chooseCase(value);setFile(null);setStatus('valid');setMessage('Class case ready. You’re ready to begin.');}}/>:<section className="upload-card" aria-labelledby="upload-title"><div className="card-heading"><div><h2 id="upload-title">Have a case from your instructor?</h2><p>Upload a PDF or JSON file.</p></div></div>
 <input ref={input} id="case-file" type="file" tabIndex={-1} aria-label="Upload a PDF or JSON case" aria-describedby="file-help" accept=".json,.pdf,application/json,application/pdf" className="visually-hidden" disabled={status==='validating'} onChange={event=>{const selected=event.target.files?.[0];if(selected)void upload(selected);event.target.value='';}}/>
 <div className={'dropzone '+(dragging?'dropzone-active':'')} aria-busy={status==='validating'} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(status==='validating')return;const files=event.dataTransfer.files;if(files.length!==1){setStatus('error');setMessage('Choose one PDF or JSON case file at a time.');return;}void upload(files[0]);}}><Icon name="upload" size={28}/><h3>Drop your case file here</h3><button className="button secondary" onClick={()=>input.current?.click()} disabled={status==='validating'}>Choose a file <Icon name="file" size={16}/></button><small id="file-help">PDF or JSON · Up to 1 MB · 1–20 records</small></div>
<p className="upload-privacy"><Icon name="shield" size={16}/> Your grading key stays private on the server.</p>
 </section>}<section className="sample-card" aria-labelledby="sample-title"><span className="eyebrow">NO FILE? TRY THIS</span><h2 id="sample-title">Explore the sample case</h2><p>Review five fictional job applications. Teach your AI to find evidence and recommend a responsible action.</p><div className="sample-meta"><span>5 fictional records</span><span>3 AI stages</span></div><button className="button secondary" onClick={()=>void sample()} disabled={status==='validating'}>Try Sample Case <Icon name="arrow" size={17}/></button><small>A ready-to-use case. No upload needed.</small></section></div>
 <p className="case-switch-note">Each case keeps its own instructions and practice history in this workspace. Choosing another case does not clear them.</p></section>
 {!valid&&<><p id="case-next-step" className="next-step-note" role="status">{status==='validating'?'Preparing your case. Continue when processing finishes.':'Choose a valid file or the sample to unlock the next step.'}</p><div className="page-actions upload-next"><span>Next: Scenario Briefing</span><button className="button primary" disabled aria-describedby="case-next-step">Continue<Icon name="arrow" size={17}/></button></div></>}
 <section className="format-note case-file-help"><h3 className="always-visible-heading">Need help with a case file?</h3><div><h3>One case. A workflow you can improve.</h3><p>Start with your own case or try the sample. We will guide you through each step.</p><ol><li>Choose a case.</li><li>Build your AI agent.</li><li>Review results and improve.</li></ol><p>Include the business context, assignment, requirements, 1–20 records, allowed actions, and an explicit grading key. Grading answers stay private; missing answers are never invented.</p><p>PDFs must be readable. PDF import uses real AI and API credits, even in demo mode.</p><p>JSON needs id, title, story, task, requirements, items, answer_key, and decisions. Targeted decisions also need the exact target record ID. Characters, rubric, and skill_tags are optional.</p><p>{lab.local?'Local uploads expire after four hours. Keep your original file.':'Uploaded cases are private to your authenticated account.'}</p></div></section></div>;
}

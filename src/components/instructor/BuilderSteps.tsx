'use client';
import {useRef,useState} from 'react';
import {AI_SKILLS,DECISION_PRESETS,RUBRIC_HIGHLIGHTS,type BuilderSetup} from '@/lib/case-builder';
import {Icon} from '../lab/ui';

export type Suggestions={courseSkills:string[];industries:string[]};
type StepProps={setup:BuilderSetup;update:(change:(draft:BuilderSetup)=>void)=>void};

// A short list of strings with add and remove.
export function ListEditor({id,label,items,onChange,placeholder,max,help}:{id:string;label:string;items:string[];onChange:(items:string[])=>void;placeholder:string;max:number;help?:string}){
 const [value,setValue]=useState('');
 const add=()=>{const text=value.trim();if(!text||items.length>=max)return;onChange([...items,text]);setValue('');};
 return <div className="pb-field">
  <label htmlFor={id}>{label}</label>{help&&<small className="pb-help">{help}</small>}
  {items.length>0&&<ul className="pb-list">{items.map((item,index)=><li key={index}><span>{item}</span><button type="button" className="text-button" aria-label={'Remove '+item} onClick={()=>onChange(items.filter((_,i)=>i!==index))}>Remove</button></li>)}</ul>}
  <div className="pb-inline"><input id={id} className="input" value={value} placeholder={placeholder} maxLength={400} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/><button type="button" className="button secondary" onClick={add} disabled={!value.trim()||items.length>=max}>Add</button></div>
 </div>;
}

export function MaterialsStep({setup,update,onAnalyzed}:StepProps&{onAnalyzed:(s:Suggestions)=>void}){
 const picker=useRef<HTMLInputElement>(null);
 const [files,setFiles]=useState<File[]>([]),[pasted,setPasted]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState<{kind:'error'|'success';text:string}|null>(null);
 async function analyze(){
  if(!files.length&&!pasted.trim()){setMessage({kind:'error',text:'Add a file or paste some course text first.'});return;}
  if(files.reduce((sum,file)=>sum+file.size,0)>4*1024*1024){setMessage({kind:'error',text:'Materials must total 4 MB or less.'});return;}
  setBusy(true);setMessage(null);
  try{
   const form=new FormData();files.forEach(file=>form.append('files',file));form.append('pasted',pasted);
   const response=await fetch('/api/instructor/builder/analyze',{method:'POST',body:form});const body=await response.json();
   if(!response.ok)throw Error(body.error||'Could not read the materials.');
   update(draft=>{
    draft.course.name=draft.course.name||body.course_name;draft.course.discipline=draft.course.discipline||body.discipline;draft.course.level=body.level||draft.course.level;
    draft.materials={digest:body.digest,files:body.files||[]};
    const existing=new Set(draft.outcomes.map(o=>o.text.toLowerCase()));
    draft.outcomes=[...draft.outcomes,...(body.outcomes as string[]).filter(text=>!existing.has(text.toLowerCase())).map(text=>({text,confirmed:false}))].slice(0,12);
    if(body.ai_skills?.length)draft.aiSkills=body.ai_skills;
   });
   onAnalyzed({courseSkills:body.course_skills||[],industries:body.industries||[]});
   setMessage({kind:'success',text:'Materials read. Review the suggested learning outcomes next.'});
  }catch(error){setMessage({kind:'error',text:error instanceof Error?error.message:'Could not read the materials.'});}
  finally{setBusy(false);}
 }
 return <div className="pb-step">
  <div className="pb-grid-3">
   <div className="pb-field"><label htmlFor="course-name">Course name</label><input id="course-name" className="input" value={setup.course.name} maxLength={160} placeholder="FINA 40213 Credit Analysis" onChange={event=>update(d=>{d.course.name=event.target.value;})}/></div>
   <div className="pb-field"><label htmlFor="course-discipline">Discipline</label><input id="course-discipline" className="input" value={setup.course.discipline} maxLength={160} placeholder="Finance" onChange={event=>update(d=>{d.course.discipline=event.target.value;})}/></div>
   <div className="pb-field"><label htmlFor="course-level">Level</label><select id="course-level" className="input" value={setup.course.level} onChange={event=>update(d=>{d.course.level=event.target.value as BuilderSetup['course']['level'];})}><option value="undergraduate">Undergraduate</option><option value="graduate">Graduate</option><option value="executive">Executive education</option></select></div>
  </div>
  <section className="pb-section">
   <h3>Syllabus or assignment</h3>
   <p className="pb-help">PDF or plain text, up to 4 files and 4 MB. Save Word files as PDF first. Proofwork reads them to suggest outcomes and skills; the files themselves aren't stored.</p>
   <input ref={picker} type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain" className="visually-hidden" tabIndex={-1} aria-label="Choose syllabus or assignment files" onChange={event=>{const chosen=[...(event.target.files||[])];setFiles(current=>[...current,...chosen].slice(0,4));event.target.value='';}}/>
   <div className="pb-inline"><button type="button" className="button secondary" onClick={()=>picker.current?.click()} disabled={busy||files.length>=4}><Icon name="upload" size={16}/> Choose files</button>{files.length>0&&<span className="pb-help">{files.length} file{files.length===1?'':'s'} selected</span>}</div>
   {files.length>0&&<ul className="pb-list">{files.map((file,index)=><li key={index}><span><Icon name="file" size={15}/> {file.name} <small>{(file.size/1024).toFixed(0)} KB</small></span><button type="button" className="text-button" onClick={()=>setFiles(files.filter((_,i)=>i!==index))}>Remove</button></li>)}</ul>}
   <div className="pb-field"><label htmlFor="pasted">Or paste text</label><textarea id="pasted" className="input" rows={5} value={pasted} maxLength={120000} placeholder="Paste the assignment prompt, learning objectives, or grading criteria" onChange={event=>setPasted(event.target.value)}/></div>
   <div className="pb-inline"><button type="button" className="button primary" onClick={()=>void analyze()} disabled={busy}>{busy?'Reading materials…':'Read materials'}</button>{busy&&<span className="pb-help" role="status">This can take up to a minute.</span>}</div>
   {message&&<p className={message.kind==='error'?'pb-message error-text':'pb-message success-text'} role={message.kind==='error'?'alert':'status'}>{message.text}</p>}
  </section>
  <section className="pb-section">
   <h3>Summary Proofwork will use</h3>
   <p className="pb-help">Filled in when you read materials. Edit it freely, or write your own if you skipped the upload.</p>
   <textarea aria-label="Course materials summary" className="input" rows={7} value={setup.materials.digest} maxLength={20000} placeholder="Key topics, the assignment's goal, grading criteria, domain rules, and terms students should use" onChange={event=>update(d=>{d.materials.digest=event.target.value;})}/>
  </section>
 </div>;
}

export function OutcomesStep({setup,update}:StepProps){
 const [value,setValue]=useState('');
 const confirmed=setup.outcomes.filter(o=>o.confirmed).length;
 return <div className="pb-step">
  <p className="pb-lead">Confirm what students should be able to do after this case. Proofwork designs records and planted traps around confirmed outcomes only.</p>
  {setup.outcomes.length===0&&<p className="pb-empty">No outcomes yet. Read your materials for suggestions, or add your own below.</p>}
  <ol className="pb-outcomes">{setup.outcomes.map((outcome,index)=><li key={index} className={outcome.confirmed?'is-confirmed':''}>
   <input type="checkbox" id={'outcome-'+index} checked={outcome.confirmed} onChange={event=>update(d=>{d.outcomes[index].confirmed=event.target.checked;})}/>
   <label htmlFor={'outcome-'+index} className="visually-hidden">Confirm outcome {index+1}</label>
   <textarea aria-label={'Outcome '+(index+1)} className="input" rows={2} value={outcome.text} maxLength={400} onChange={event=>update(d=>{d.outcomes[index].text=event.target.value;})}/>
   <button type="button" className="text-button" onClick={()=>update(d=>{d.outcomes.splice(index,1);})}>Remove</button>
  </li>)}</ol>
  <div className="pb-inline">
   <label htmlFor="new-outcome" className="visually-hidden">New learning outcome</label>
   <input id="new-outcome" className="input" value={value} maxLength={400} placeholder="Evaluate loan files against a written credit policy" onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&value.trim()){event.preventDefault();update(d=>{d.outcomes.push({text:value.trim(),confirmed:true});});setValue('');}}}/>
   <button type="button" className="button secondary" disabled={!value.trim()||setup.outcomes.length>=12} onClick={()=>{update(d=>{d.outcomes.push({text:value.trim(),confirmed:true});});setValue('');}}>Add outcome</button>
  </div>
  <div className="pb-inline pb-meta"><span>{confirmed} of {setup.outcomes.length} confirmed</span>{setup.outcomes.length>0&&confirmed<setup.outcomes.length&&<button type="button" className="text-button" onClick={()=>update(d=>{d.outcomes.forEach(o=>{o.confirmed=true;});})}>Confirm all</button>}</div>
 </div>;
}

export function SkillsStep({setup,update,suggestions}:StepProps&{suggestions:Suggestions}){
 const toggle=(id:string)=>update(d=>{d.aiSkills=d.aiSkills.includes(id)?d.aiSkills.filter(s=>s!==id):[...d.aiSkills,id].slice(0,6);});
 const remaining=suggestions.courseSkills.filter(skill=>!setup.courseSkills.some(s=>s.toLowerCase()===skill.toLowerCase()));
 return <div className="pb-step">
  <section className="pb-section">
   <h3>AI skills <small>Choose up to 6</small></h3>
   <p className="pb-help">Each skill becomes a planted record that tests it.</p>
   <div className="pb-choices">{AI_SKILLS.map(skill=>{const on=setup.aiSkills.includes(skill.id);return <label key={skill.id} className={'pb-choice'+(on?' is-on':'')}><input type="checkbox" checked={on} disabled={!on&&setup.aiSkills.length>=6} onChange={()=>toggle(skill.id)}/><span><strong>{skill.label}</strong><small>{skill.hint}</small></span></label>;})}</div>
  </section>
  <section className="pb-section">
   <h3>Course skills</h3>
   {remaining.length>0&&<div className="pb-suggest"><span className="pb-help">Suggested from your materials:</span>{remaining.map(skill=><button type="button" key={skill} className="pb-chip" onClick={()=>update(d=>{if(d.courseSkills.length<8)d.courseSkills.push(skill);})}>+ {skill}</button>)}</div>}
   <ListEditor id="course-skill" label="Skills from your course this case should exercise" items={setup.courseSkills} max={8} placeholder="Debt service coverage analysis" onChange={items=>update(d=>{d.courseSkills=items;})}/>
  </section>
 </div>;
}

export function DesignStep({setup,update,suggestions}:StepProps&{suggestions:Suggestions}){
 const design=setup.design;
 const set=<K extends keyof BuilderSetup['design']>(key:K,value:BuilderSetup['design'][K])=>update(d=>{d.design[key]=value;});
 return <div className="pb-step">
  <section className="pb-section">
   <h3>Setting</h3>
   <div className="pb-field"><label htmlFor="industry">Industry or organization</label><input id="industry" className="input" value={design.industry} maxLength={200} placeholder="Regional community bank" onChange={event=>set('industry',event.target.value)}/>
    {suggestions.industries.length>0&&<div className="pb-suggest">{suggestions.industries.map(item=><button type="button" key={item} className="pb-chip" onClick={()=>set('industry',item)}>{item}</button>)}</div>}</div>
   <div className="pb-field"><label htmlFor="scenario">Scenario idea <small>optional</small></label><textarea id="scenario" className="input" rows={3} value={design.scenario} maxLength={4000} placeholder="The bank wants AI to pre-screen small business loan exceptions before an underwriter signs off." onChange={event=>set('scenario',event.target.value)}/></div>
   <div className="pb-field"><label htmlFor="facts">Source facts, policies, or data the case must use <small>optional</small></label><small className="pb-help">For complex cases, paste policy text, thresholds, data tables, or required details. Proofwork builds records and criteria around them.</small><textarea id="facts" className="input" rows={6} value={design.sourceFacts} maxLength={12000} placeholder="Minimum DSCR 1.25x. Exceptions above $250k need committee review. Personal guarantees required for owners above 20%." onChange={event=>set('sourceFacts',event.target.value)}/></div>
  </section>
  <section className="pb-section">
   <h3>Records</h3>
   <div className="pb-grid-4">
    <div className="pb-field"><label htmlFor="record-count">Number of records</label><input id="record-count" type="number" min={3} max={20} className="input" value={design.recordCount} onChange={event=>set('recordCount',Math.max(3,Math.min(20,Number(event.target.value)||3)))}/></div>
    <div className="pb-field"><label htmlFor="planted">Planted records</label><input id="planted" type="number" min={0} max={Math.min(10,design.recordCount)} className="input" value={design.plantedCount} onChange={event=>set('plantedCount',Math.max(0,Math.min(10,design.recordCount,Number(event.target.value)||0)))}/></div>
    <div className="pb-field"><label htmlFor="detail">Detail per record</label><select id="detail" className="input" value={design.recordDetail} onChange={event=>set('recordDetail',event.target.value as typeof design.recordDetail)}><option value="brief">Brief (40–80 words)</option><option value="standard">Standard (100–180 words)</option><option value="detailed">Detailed (220–400 words)</option></select></div>
    <div className="pb-field"><label htmlFor="difficulty">Difficulty</label><select id="difficulty" className="input" value={design.difficulty} onChange={event=>set('difficulty',event.target.value as typeof design.difficulty)}><option value="introductory">Introductory</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
   </div>
  </section>
  <section className="pb-section">
   <h3>Allowed actions</h3>
   <p className="pb-help">The decisions an agent can make for each record. Use lowercase words with underscores.</p>
   <div className="pb-suggest">{DECISION_PRESETS.map(preset=><button type="button" key={preset.id} className="pb-chip" onClick={()=>set('decisions',preset.decisions.map(d=>({...d})))}>{preset.label}: {preset.decisions.map(d=>d.type.replaceAll('_',' ')).join(', ')}</button>)}</div>
   <ul className="pb-actions">{design.decisions.map((decision,index)=><li key={index}>
    <label className="visually-hidden" htmlFor={'action-'+index}>Action {index+1}</label>
    <input id={'action-'+index} className="input" value={decision.type} maxLength={64} onChange={event=>update(d=>{d.design.decisions[index].type=event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_');})}/>
    <label className="pb-check"><input type="checkbox" checked={decision.requires_target} onChange={event=>update(d=>{d.design.decisions[index].requires_target=event.target.checked;})}/> Points to another record</label>
    <button type="button" className="text-button" disabled={design.decisions.length<=2} onClick={()=>update(d=>{d.design.decisions.splice(index,1);})}>Remove</button>
   </li>)}</ul>
   <button type="button" className="button secondary" disabled={design.decisions.length>=8} onClick={()=>update(d=>{d.design.decisions.push({type:'new_action',requires_target:false});})}>Add action</button>
  </section>
  <section className="pb-section">
   <h3>Questions and prompting requirements</h3>
   <ListEditor id="student-question" label="Questions students must address" help="Shown to students in the case objective." items={design.studentQuestions} max={8} placeholder="Which records should never be decided by AI alone, and why?" onChange={items=>update(d=>{d.design.studentQuestions=items;})}/>
   <div className="pb-field"><label htmlFor="prompting">Prompting requirements</label><small className="pb-help">Rules for how students write their agent's instructions. Shown to students.</small><textarea id="prompting" className="input" rows={3} value={design.promptingRequirements} maxLength={2000} placeholder="Each stage must name the criterion it applies. The Flag stage must explain every decision in one sentence." onChange={event=>set('promptingRequirements',event.target.value)}/></div>
  </section>
 </div>;
}

export function RubricStep({setup,update}:StepProps){
 const custom=setup.rubric.highlights.filter(item=>!RUBRIC_HIGHLIGHTS.includes(item));
 const toggle=(item:string)=>update(d=>{d.rubric.highlights=d.rubric.highlights.includes(item)?d.rubric.highlights.filter(h=>h!==item):[...d.rubric.highlights,item].slice(0,12);});
 return <div className="pb-step">
  <p className="pb-lead">What should your grading emphasize? Proofwork uses this to shape planted records and the private notes on each one.</p>
  <div className="pb-choices pb-choices-compact">{RUBRIC_HIGHLIGHTS.map(item=>{const on=setup.rubric.highlights.includes(item);return <label key={item} className={'pb-choice'+(on?' is-on':'')}><input type="checkbox" checked={on} onChange={()=>toggle(item)}/><span><strong>{item}</strong></span></label>;})}</div>
  <ListEditor id="rubric-custom" label="Your own rubric points" items={custom} max={6} placeholder="Recommends a monitoring step for approved exceptions" onChange={items=>update(d=>{d.rubric.highlights=[...d.rubric.highlights.filter(h=>RUBRIC_HIGHLIGHTS.includes(h)),...items].slice(0,12);})}/>
  <div className="pb-field"><label htmlFor="rubric-notes">Grading notes <small>private</small></label><textarea id="rubric-notes" className="input" rows={4} value={setup.rubric.notes} maxLength={2000} placeholder="Weight planted records at 2x. A student who escalates every record should not earn full credit." onChange={event=>update(d=>{d.rubric.notes=event.target.value;})}/></div>
 </div>;
}

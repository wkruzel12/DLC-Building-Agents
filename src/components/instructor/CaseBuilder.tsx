'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLab} from '../lab/FlowProvider';
import {Icon,PageHeading} from '../lab/ui';
import {useGuideContext} from './GuideContext';
import {MaterialsStep,OutcomesStep,SkillsStep,DesignStep,RubricStep,type Suggestions} from './BuilderSteps';
import {CaseReview} from './CaseReview';
import {builderSetupSchema,editableCaseSchema,emptySetup,draftDigest,type BuilderSetup,type EditableCase} from '@/lib/case-builder';

const STEPS=[
 {id:'materials',title:'Materials',description:'Upload a syllabus or assignment so Proofwork understands your course.'},
 {id:'outcomes',title:'Learning outcomes',description:'Confirm what students should be able to do after this case.'},
 {id:'skills',title:'Skills',description:'Pick the AI skills and course skills the case should teach.'},
 {id:'design',title:'Case design',description:'Shape the setting, records, actions, and what students must address.'},
 {id:'rubric',title:'Rubric',description:'Choose what your grading emphasizes.'},
 {id:'review',title:'Review and publish',description:'Draft the case with AI, edit every detail, and publish.'}
] as const;
type Saved={setup:BuilderSetup;edit:EditableCase|null;step:number;reviewed:boolean;suggestions:Suggestions};
const emptySuggestions:Suggestions={courseSkills:[],industries:[]};

// Drafts live in this browser only until published (a per-instructor convenience).
function storageKey(id?:string){return 'proofwork.case-builder.v1.'+(id||'local');}
function load(key:string):Saved|null{
 try{
  const raw=JSON.parse(localStorage.getItem(key)||'null');if(!raw)return null;
  const setup=builderSetupSchema.safeParse(raw.setup);if(!setup.success)return null;
  const edit=raw.edit?editableCaseSchema.safeParse(raw.edit):null;
  return {setup:setup.data,edit:edit?.success?edit.data:null,step:Math.max(0,Math.min(STEPS.length-1,Number(raw.step)||0)),reviewed:false,suggestions:{courseSkills:Array.isArray(raw.suggestions?.courseSkills)?raw.suggestions.courseSkills.slice(0,8):[],industries:Array.isArray(raw.suggestions?.industries)?raw.suggestions.industries.slice(0,4):[]}};
 }catch{return null;}
}

export function CaseBuilder(){
 const lab=useLab(),guide=useGuideContext(),key=storageKey(lab.user?.id);
 const [state,setState]=useState<Saved>({setup:emptySetup(),edit:null,step:0,reviewed:false,suggestions:emptySuggestions});
 const [restored,setRestored]=useState(false),[savedNote,setSavedNote]=useState('');
 const heading=useRef<HTMLHeadingElement>(null);

 useEffect(()=>{
  const saved=load(key);
  if(saved){
   setState(saved);
   const started=Boolean(saved.edit||saved.setup.course.name||saved.setup.materials.digest||saved.setup.outcomes.length||saved.step>0);
   if(started)setSavedNote('Restored your saved draft.');
  }
  setRestored(true);
 },[key]);
 useEffect(()=>{
  if(!restored)return;
  try{localStorage.setItem(key,JSON.stringify({...state,reviewed:false}));}catch{setSavedNote('Your browser blocked saving. Keep this tab open until you publish.');}
  guide.set({page:'create',draft:draftDigest(state.setup,state.edit)});
 },[state,restored,key,guide]);

 const update=useCallback((change:(draft:BuilderSetup)=>void)=>setState(current=>{
  const setup=structuredClone(current.setup);change(setup);
  // Keep a drafted case's actions in sync with step 4.
  const edit=current.edit?{...current.edit,decisions:setup.design.decisions.map(d=>({...d}))}:null;
  return {...current,setup,edit,reviewed:false};
 }),[]);
 const go=(step:number)=>{setState(current=>({...current,step}));setTimeout(()=>heading.current?.focus(),0);};
 function reset(){if(!window.confirm('Start over? This clears the setup and any drafted case in this browser.'))return;try{localStorage.removeItem(key);}catch{}setState({setup:emptySetup(),edit:null,step:0,reviewed:false,suggestions:emptySuggestions});setSavedNote('');}

 const {setup,step}=state,current=STEPS[step];
 const done=[Boolean(setup.materials.digest||setup.course.name),setup.outcomes.some(o=>o.confirmed),setup.aiSkills.length>0,Boolean(setup.design.industry||setup.design.scenario),setup.rubric.highlights.length>0,Boolean(state.edit)];
 return <div className="lesson-page instructor-page pb-builder">
  <PageHeading step="INSTRUCTOR / CREATE CASE" title="Create a case" description="Turn your course materials into a simulation where students build and test an AI agent." action={<button type="button" className="button secondary" onClick={reset}>Start over</button>}/>
  {savedNote&&<p className="pb-help pb-saved" role="status">{savedNote} Drafts are saved in this browser until you publish.</p>}
  <div className="pb-layout">
   <nav className="pb-steps" aria-label="Case builder steps"><ol>{STEPS.map((item,index)=><li key={item.id}><button type="button" aria-current={index===step?'step':undefined} className={'pb-step-link'+(index===step?' is-current':'')+(done[index]&&index!==step?' is-done':'')} onClick={()=>go(index)}>
    <span className="pb-step-num" aria-hidden="true">{done[index]&&index!==step?<Icon name="check" size={14}/>:index+1}</span><span>{item.title}</span>
   </button></li>)}</ol></nav>
   <section className="pb-main" aria-labelledby="pb-step-title">
    <header className="pb-main-head"><span className="eyebrow">STEP {step+1} OF {STEPS.length}</span><h2 id="pb-step-title" ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.description}</p></header>
    {current.id==='materials'&&<MaterialsStep setup={setup} update={update} onAnalyzed={suggestions=>setState(s=>({...s,suggestions}))}/>}
    {current.id==='outcomes'&&<OutcomesStep setup={setup} update={update}/>}
    {current.id==='skills'&&<SkillsStep setup={setup} update={update} suggestions={state.suggestions}/>}
    {current.id==='design'&&<DesignStep setup={setup} update={update} suggestions={state.suggestions}/>}
    {current.id==='rubric'&&<RubricStep setup={setup} update={update}/>}
    {current.id==='review'&&<CaseReview setup={setup} edit={state.edit} setEdit={edit=>setState(s=>({...s,edit}))} reviewed={state.reviewed} setReviewed={reviewed=>setState(s=>({...s,reviewed}))} onPublished={()=>{try{localStorage.removeItem(key);}catch{}setState({setup:emptySetup(),edit:null,step:STEPS.length-1,reviewed:false,suggestions:emptySuggestions});setSavedNote('');}}/>}
    <footer className="pb-nav">
     {step>0?<button type="button" className="button secondary" onClick={()=>go(step-1)}><Icon name="back" size={16}/> Back</button>:<span/>}
     {step<STEPS.length-1&&<button type="button" className="button primary" onClick={()=>go(step+1)}>Next: {STEPS[step+1].title} <Icon name="arrow" size={16}/></button>}
    </footer>
   </section>
  </div>
 </div>;
}

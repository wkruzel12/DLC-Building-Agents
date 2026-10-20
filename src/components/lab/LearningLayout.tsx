'use client';
import type {ReactNode} from 'react';
import {PageHeading} from './ui';
import {compareAttempts} from '@/lib/results-learning';
import type {Attempt} from '@/lib/types';
import {stages} from './builder-learning';

export function LessonFrame({step,title,intro,children}:{step:string;title:string;intro:string;children:ReactNode}){
 return <div className="lesson-page"><PageHeading step={step} title={title} description={intro}/>{children}</div>;
}
export function LessonHelp({children,label='Need help?'}:{children:ReactNode;label?:string}){
 return <details className="lesson-help"><summary>{label}</summary><div>{children}</div></details>;
}
export function LessonNavigation({back,children}:{back?:ReactNode;children?:ReactNode}){
 return <footer className="lesson-navigation"><div>{back}</div><div>{children}</div></footer>;
}
export function CurrentObjective({children}:{children:ReactNode}){
 return <section className="current-objective" aria-label="Current objective"><span className="eyebrow">YOUR OBJECTIVE</span><p>{children}</p></section>;
}

// Summarize recorded attempts only. Practice outputs never establish a grade.
export function AttemptSummary({attempt,history}:{attempt:Attempt;history:Attempt[]}){
 const previous=[...history].filter(item=>item.id!==attempt.id&&item.created_at<=attempt.created_at).sort((a,b)=>a.created_at.localeCompare(b.created_at))[0];
 const difference=previous?compareAttempts(previous,attempt):null;
 return <section className="attempt-takeaways" aria-label="Your learning summary"><h3>Your learning summary</h3><p>{attempt.results.filter(item=>item.match).length} of {attempt.results.length} decisions matched in this run ({attempt.accuracy}% accuracy). {attempt.errors>0?`${attempt.errors} processing errors were recorded.`:'No processing errors were recorded.'}</p>
 <p>The full simulation attempted Extract, Check, and Flag on {attempt.results.length} records. You can inspect each recorded output in Results.</p>
 {difference&&<p>{difference.difference>0?`Accuracy rose by ${difference.difference} percentage points`:difference.difference<0?`Accuracy fell by ${Math.abs(difference.difference)} percentage points`:'Accuracy stayed the same'} compared with the earliest available previous run. {difference.changedStages.length?`You changed ${difference.changedStages.map(id=>stages.find(stage=>stage.id===id)!.title).join(', ')} instructions.`:'The three instructions were unchanged.'} These differences do not establish what caused the result.</p>}
 {attempt.learning?.reflection&&<><h4>Your saved reflection</h4><p className="source-copy">{attempt.learning.reflection}</p></>}
 <details><summary>Review the instructions used in this run</summary>{stages.map(stage=><section key={stage.id}><h4>{stage.title}</h4><p className="source-copy">{attempt.steps[stage.id]}</p></section>)}</details>
 <p className="learning-takeaway">A successful test shows that the AI ran. A matching decision still needs sound evidence. Keep a person responsible for reviewing uncertain or consequential decisions.</p></section>;
}

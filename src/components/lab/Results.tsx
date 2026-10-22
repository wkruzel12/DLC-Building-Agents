'use client';
import Link from 'next/link';
import {useLab} from './FlowProvider';
import {EmptyCase,Icon,PageHeading} from './ui';
import {LessonFrame} from './LearningLayout';
import {ResultsWorkspace} from './ResultsWorkspace';
export function Results(){
 const lab=useLab();
 if(!lab.active)return <LessonFrame step="04 / FEEDBACK & RESULTS" title="Feedback & Results" intro="Explore the recorded performance of your agent.">{lab.reference?<section className="card empty-state"><h2>Your first results are one run away.</h2><p>Build your agent and test the case to see feedback here.</p><Link className="button primary" href="/workbench">Open Agent Builder <Icon name="arrow" size={16}/></Link></section>:<EmptyCase/>}</LessonFrame>;
 return <div className="lesson-page results-lesson"><PageHeading step="REVIEW & IMPROVE" title="Feedback & Results" description="See what your agent found. Compare the evidence, then revise your instructions."/><ResultsWorkspace key={lab.active.id} attempt={lab.active}/></div>;
}

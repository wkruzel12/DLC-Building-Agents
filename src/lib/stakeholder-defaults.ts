import 'server-only';
import definition from '../../stakeholders/resume-screener.json';
import {stakeholderConfigSchema,type StakeholderConfig} from './stakeholder-config';
import type {Scenario} from './types';

export function sampleStakeholders():StakeholderConfig{return stakeholderConfigSchema.parse({status:'approved',source:'sample',personas:definition.personas});}
export function hiringStakeholders(scenario:Pick<Scenario,'title'|'story'|'task'|'requirements'>):StakeholderConfig|null{
 // Roles must fit the actual workflow, not merely a user-controlled case ID.
 if(/\b(?:non[- ]hiring|not\s+(?:a\s+)?hiring)\b/i.test(scenario.title))return null;
 const titleFits=/\b(?:resume|recruitment|recruiting|hiring)\b/i.test(scenario.title);
 const taskFits=/\b(?:screen|evaluat|review|select|hir)\w*(?:\s+[\w'-]+){0,4}\s+(?:applicants?|candidates?|resumes?)\b/i.test(scenario.task+' '+scenario.story);
 if(!titleFits&&!taskFits)return null;
 const personas=definition.personas.map(persona=>({...persona,facts:[],priorities:persona.id==='sarah'?['Improve the recruiting workflow using measured evidence.','Identify qualified candidates without unnecessary exclusions.']:['Evaluate fairness, explainability, and accountability.','Identify safeguards and evidence needed before deployment.'],challenge_questions:persona.challenge_questions.filter(question=>!/200|five|24 hours|three weeks/i.test(question))}));
 return stakeholderConfigSchema.parse({status:'approved',source:'hiring_template',personas});
}

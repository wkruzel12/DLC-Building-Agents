import 'server-only';
import data from '../../scenarios/resume-screener.json';
import type {Scenario,PublicScenario} from './types';
import {sampleStakeholders} from './stakeholder-defaults';
const scenario:Scenario={...data as Scenario,stakeholders:sampleStakeholders()};
export function loadScenario(id:string):Scenario|null {return id===scenario.id?scenario:null;}
export function publicScenario(s:Scenario):PublicScenario {return {id:s.id,title:s.title,story:s.story,task:s.task,requirements:s.requirements,decisions:s.decisions,decision_rules:s.decision_rules,skill_tags:s.skill_tags,items:s.items.map(({id,label,text})=>({id,label,text}))};}

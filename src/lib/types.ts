export type Decision = 'advance'|'reject'|'human_review';
export type Steps = {extract:string;check:string;flag:string};
export type Scenario = {id:string;title:string;story:string;task:string;requirements:string;decisions:Decision[];items:{id:string;label:string;text:string}[];answer_key:{item_id:string;decision:Decision;planted:boolean;note:string}[];characters:unknown[];rubric:Record<string,unknown>;skill_tags:string[]};
export type PublicScenario = Pick<Scenario,'id'|'title'|'story'|'task'|'requirements'|'decisions'|'items'|'skill_tags'>;
export type CaseReference = {case_id:string;scenario:PublicScenario;expires_at?:string};
export type ApplicantResult = {item_id:string;label:string;decision:Decision|'error';expected_decision:Decision;match:boolean;reason:string;outputs:{extract:string;check:string;flag:string};error?:string};
export type Attempt = {id:string;attempt_number:number;created_at:string;steps:Steps;results:ApplicantResult[];planted_caught:number;planted_total:number;accuracy:number;errors:number;mode:'demo'|'openai';storage?:'local';case_id?:string;scenario_title?:string;records?:Scenario['items']};

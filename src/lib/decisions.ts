import {z} from 'zod';

export type StructuredDecision={type:string;target_record_id?:string|null};
// Strings keep existing JSON cases and saved attempts compatible.
export type Decision=string|StructuredDecision;
export type DecisionRules=Record<string,{requires_target:boolean}>;
export type DecisionCase={decisions:string[];decision_rules?:DecisionRules;items:{id:string}[]};
export const decisionTypeSchema=z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/).refine(value=>value!=='error','The action error is reserved for execution failures.');
export const structuredDecisionSchema=z.object({type:decisionTypeSchema,target_record_id:z.string().trim().min(1).max(100).nullable().optional()}).strict();
export const decisionSchema=z.union([decisionTypeSchema,structuredDecisionSchema]);

export function decisionParts(value:Decision):{type:string;target_record_id:string|null}{return typeof value==='string'?{type:value,target_record_id:null}:{type:value.type,target_record_id:value.target_record_id??null};}
export function requiresTarget(s:Pick<DecisionCase,'decision_rules'>,type:string){return type==='merge'||(Object.hasOwn(s.decision_rules||{},type)&&s.decision_rules![type].requires_target);}
export function decisionProblem(s:DecisionCase,recordId:string,value:Decision):string|null{
 const {type,target_record_id:target}=decisionParts(value);
 if(!s.decisions.includes(type))return 'The decision type must be declared by this case.';
 if(requiresTarget(s,type)){
  if(!target)return 'This decision requires an explicit target record ID.';
  if(target===recordId)return 'A record cannot target itself.';
  if(!s.items.some(item=>item.id===target))return 'The target record ID must exist in this case.';
 }else if(target!==null)return 'This decision type does not accept a target record ID.';
 return null;
}
export function sameDecision(a:Decision,b:Decision){const left=decisionParts(a),right=decisionParts(b);return left.type===right.type&&left.target_record_id===right.target_record_id;}
export function compactDecision(value:StructuredDecision):Decision{return value.target_record_id?{type:value.type,target_record_id:value.target_record_id}:value.type;}
export function formatDecision(value:Decision){
 const {type,target_record_id}=decisionParts(value);
 const label=type==='error'?'Execution error':type.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());
 return target_record_id?`${label}${type==='merge'?' into':' →'} ${target_record_id}`:label;
}

// Only public action definitions and record IDs enter this schema, never grades.
export function flagOutputSchema(s:DecisionCase,recordId:string){
 const targets=s.items.filter(item=>item.id!==recordId).map(item=>item.id);
 return {type:'object',additionalProperties:false,properties:{decision:{anyOf:s.decisions.filter(type=>!requiresTarget(s,type)||targets.length>0).map(type=>({
  type:'object',additionalProperties:false,properties:{type:{type:'string',enum:[type]},target_record_id:requiresTarget(s,type)?{type:'string',enum:targets}:{type:'null'}},required:['type','target_record_id']
 }))},reason:{type:'string'}},required:['decision','reason']};
}

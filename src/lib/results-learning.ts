import type {ApplicantResult,Attempt,Steps} from './types';
export const DEFAULT_LEARNING_TARGET=80;
export type LearningStage=keyof Steps;
export type Coaching={created_at:string;areas:{stage:LearningStage;record_id:string;evidence:string;observation:string;why:string;consider:string;example_instruction:string}[]};
export type AttemptLearning={reflection:string;acknowledged_below_target:boolean;updated_at?:string;coaching?:Coaching};
export const emptyLearning=():AttemptLearning=>({reflection:'',acknowledged_below_target:false});
export function validReflection(value:string){return value.trim().length>=10&&value.trim().length<=1500;}
export function reviewAllowed(attempt:Attempt|undefined|null,target:number,completed:number){return Boolean(attempt&&(attempt.accuracy>=target||(completed>=3&&attempt.learning?.acknowledged_below_target)));}
export function learningPhase(completedIndex:number){return completedIndex<=1?'Discover':completedIndex===2?'Understand':completedIndex===3?'AI-assisted improvement':'Continuing improvement';}
export function resultCounts(attempt:Attempt){const correct=attempt.results.filter(item=>item.match).length;return {correct,incorrect:attempt.results.length-correct,total:attempt.results.length};}
// Whitelist the public record fields. Even legacy rows must not publish grading copies.
export function studentResult(result:ApplicantResult):ApplicantResult{return {item_id:result.item_id,label:result.label,decision:result.decision,match:result.match,reason:result.reason,outputs:{extract:result.outputs.extract,check:result.outputs.check,flag:result.outputs.flag},...(result.error?{error:result.error}:{})};}
export function studentAttempt<T extends Attempt>(attempt:T):T{return {...attempt,results:attempt.results.map(studentResult)};}
export function investigation(result:ApplicantResult,level:number){
 const missing=(['extract','check','flag'] as const).find(stage=>!result.outputs[stage]?.trim());
 const observed=result.error&&missing?{stage:missing,text:`This run recorded an error and no ${missing} output. Inspect this stage and the preceding output; an upstream error may have stopped later stages.`}:null;
 return {observed,explanation:result.match?'This recommendation matched the expected result. Check whether the evidence and reasoning were sound as well.':result.error?'This record could not be processed successfully. Read the recorded error and stage outputs before changing instructions.':'This recommendation did not match the expected result. The score alone does not establish which stage caused the difference.',questions:level>=2?['Compare the exact instructions used in this attempt with the recorded output. Did the AI follow them?','Compare the original record, extracted facts, and case requirements. Where does the first unsupported step appear?']:['What evidence did the AI use?','Did your instructions explain how to handle missing or unclear information?']};
}
export function compareAttempts(previous:Attempt,current:Attempt){return {difference:current.accuracy-previous.accuracy,changedStages:(['extract','check','flag'] as const).filter(stage=>previous.steps[stage]!==current.steps[stage]),changedOutcomes:current.results.filter(item=>{const prior=previous.results.find(row=>row.item_id===item.item_id);return prior&&JSON.stringify(prior.decision)!==JSON.stringify(item.decision);}).map(item=>item.item_id)};}

import type {Attempt} from './types';

// Compare only runs known to share a case and execution mode.
export function performanceHistory(current:Attempt,history:Attempt[]){
 const rows=history.filter(row=>row.mode===current.mode&&(row.id===current.id||(current.case_id?row.case_id===current.case_id:!row.case_id&&Boolean(current.scenario_title&&row.scenario_title===current.scenario_title))));
 const unique=new Map(rows.map(row=>[row.id,row]));unique.set(current.id,current);
 return [...unique.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.attempt_number-b.attempt_number);
}
export function performanceOutcomes(attempt:Attempt){
 const matched=attempt.results.filter(row=>row.match).length;
 const errors=attempt.results.filter(row=>!row.match&&(row.decision==='error'||Boolean(row.error))).length;
 return {matched,errors,mismatched:attempt.results.length-matched-errors,total:attempt.results.length};
}

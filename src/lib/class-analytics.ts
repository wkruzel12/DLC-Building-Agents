import type {Decision,Scenario} from './types';
import {formatDecision,sameDecision} from './decisions';

export type ClassAttemptRow={user_id:string;attempt_number:number;created_at:string;accuracy:number;planted_caught:number;planted_total:number;errors:number;results:{item_id:string;decision:Decision|'error';match:boolean}[]};
export type RecordDifficulty={item_id:string;label:string;planted:boolean;expected:string;attempted:number;missed:number;miss_rate:number;common_wrong:string|null;common_wrong_count:number};
export type ClassSummary={enrolled:number;students:number;runs:number;runs_per_student:number;average_latest_accuracy:number|null;average_best_accuracy:number|null;highest_accuracy:number|null;at_target:number;target:number;toughest:RecordDifficulty[]};

const newest=(a:ClassAttemptRow,b:ClassAttemptRow)=>b.created_at.localeCompare(a.created_at)||b.attempt_number-a.attempt_number;
const average=(values:number[])=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;

// Pure summary of one case's attempts. "Latest" = each student's most recent run, which
// reflects where the class is now; "best" = each student's highest run.
export function classSummary(scenario:Scenario,rows:ClassAttemptRow[],target:number,enrolled=0):ClassSummary{
 const byStudent=new Map<string,ClassAttemptRow[]>();
 for(const row of rows)byStudent.set(row.user_id,[...(byStudent.get(row.user_id)||[]),row]);
 const latest=[...byStudent.values()].map(list=>[...list].sort(newest)[0]);
 const best=[...byStudent.values()].map(list=>Math.max(...list.map(row=>row.accuracy)));
 const students=byStudent.size;
 const toughest=scenario.items.map(item=>{
  const key=scenario.answer_key.find(entry=>entry.item_id===item.id);
  const outcomes=latest.map(row=>row.results.find(result=>result.item_id===item.id)).filter((result):result is ClassAttemptRow['results'][number]=>Boolean(result));
  const misses=outcomes.filter(result=>!(result.decision!=='error'&&key&&sameDecision(result.decision,key.decision)));
  const wrong=new Map<string,number>();
  for(const miss of misses){const label=miss.decision==='error'?'Execution error':formatDecision(miss.decision);wrong.set(label,(wrong.get(label)||0)+1);}
  const [commonWrong,commonCount]=[...wrong.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||[null,0];
  return {item_id:item.id,label:item.label,planted:Boolean(key?.planted),expected:key?formatDecision(key.decision):'Not graded',attempted:outcomes.length,missed:misses.length,miss_rate:outcomes.length?Math.round(100*misses.length/outcomes.length):0,common_wrong:commonWrong,common_wrong_count:commonCount};
 }).sort((a,b)=>b.miss_rate-a.miss_rate||b.missed-a.missed||Number(b.planted)-Number(a.planted)||a.label.localeCompare(b.label));
 return {
  enrolled:Math.max(enrolled,students),students,runs:rows.length,
  runs_per_student:students?Math.round(10*rows.length/students)/10:0,
  average_latest_accuracy:average(latest.map(row=>row.accuracy)),
  average_best_accuracy:average(best),
  highest_accuracy:best.length?Math.max(...best):null,
  at_target:best.filter(value=>value>=target).length,target,toughest
 };
}

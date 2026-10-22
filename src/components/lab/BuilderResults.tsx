'use client';
import type {ApplicantResult,Attempt} from '@/lib/types';
import {ResultsWorkspace} from './ResultsWorkspace';
import {readableEvidence} from '@/lib/record-review';
export function RunRecords({results,records}:{results:ApplicantResult[];records?:Attempt['records'];graded?:boolean}){
 return <section className="clean-card"><h3>Recorded results</h3><p>This run is incomplete. No reliable score is available.</p>{results.map((row,index)=><section className="clean-incomplete-record" key={row.item_id+index}><h4>{row.label}</h4>{row.error&&<p>{row.error}</p>}<h5>What your agent pulled</h5>{readableEvidence(row.outputs.extract).map((line,i)=><p key={i}>{line}</p>)}<h5>Original record</h5><p>{records?.find(record=>record.id===row.item_id)?.text||'Original text is not available.'}</p></section>)}</section>;
}
export function BuilderResults({attempt,onImprove}:{attempt:Attempt;onImprove:()=>void}){
 return <ResultsWorkspace key={attempt.id} attempt={attempt} builder onReview={onImprove}/>;
}

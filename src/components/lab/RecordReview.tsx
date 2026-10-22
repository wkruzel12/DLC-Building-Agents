import type {ApplicantResult,Attempt,PublicScenario} from '@/lib/types';
import {recordEvidence,readableEvidence,sampleReference} from '@/lib/record-review';
import {formatDecision} from '@/lib/decisions';
import {instructionFields} from '@/lib/combined-builder';
export function RecordReview({attempt,result,scenario}:{attempt:Attempt;result:ApplicantResult;scenario?:PublicScenario}){
 const reference=sampleReference(scenario,attempt.records,result.item_id),evidence=recordEvidence(attempt,result),reason=readableEvidence(result.reason);
 return <div className="clean-record-review">
 <header className="clean-record-heading"><h2>{result.label}</h2><span className={'clean-status '+(result.match?'is-match':'')}>{result.error?'Processing error':result.match?'Matched':'Needs review'}</span><small>Record {result.item_id}</small></header>
 <section className="clean-card clean-snapshot"><span className="clean-kicker">THE INSTRUCTIONS USED IN THIS ATTEMPT</span><h3>What you told your agent to do</h3><div>{instructionFields.map(field=><section key={field.id}><h4>{field.label}</h4><p>{attempt.steps[field.id]||'No instruction was recorded.'}</p></section>)}</div></section>
 <div className="clean-comparison"><section className="clean-card"><h3>What your agent pulled</h3><div className="clean-evidence">{evidence.simulated&&<p className="clean-mode-note">Simulated run: the demo reused the resume text. No AI extraction was generated.</p>}{evidence.lines.length?<ul>{evidence.lines.map((line,index)=><li key={index}>{line}</li>)}</ul>:<p>No extracted evidence was recorded for this attempt.</p>}<div className="clean-recommendation"><strong>Agent recommendation:</strong><p>{result.decision==='error'?'The agent could not finish this record.':formatDecision(result.decision)}</p>{result.error?<p>{result.error}</p>:!evidence.simulated&&reason.map((text,index)=><p key={index}>{text}</p>)}</div></div></section>
 <section className="clean-card"><h3>What it should have pulled</h3><div className="clean-evidence">{reference?<><ul>{reference.evidence.map(text=><li key={text}>{text}</li>)}</ul><div className="clean-recommendation"><strong>The key connection:</strong><p>{reference.connection}</p></div></>:<><p>A record-specific reference has not been supplied for this case.</p><p>Compare the recorded evidence with the original record and these case requirements:</p><p className="clean-source">{scenario?.requirements||'Reload the original case to see its requirements.'}</p></>}</div></section></div>
 <section className="clean-goal"><h3>What we’re going for</h3>{reference?<p><strong>{reference.goal}</strong> {reference.why}</p>:<p>A case-supported recommendation based on documented evidence. Do not invent missing facts or assume a record-specific target.</p>}</section>
 </div>;
}

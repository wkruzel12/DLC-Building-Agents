'use client';
import {useId} from 'react';
import type {Attempt} from '@/lib/types';
import {performanceHistory,performanceOutcomes} from '@/lib/performance-metrics';

export function PerformanceDashboard({attempt,history,target,onSelect}:{attempt:Attempt;history:Attempt[];target:number;onSelect:(attempt:Attempt)=>void}){
 const id=useId(),rows=performanceHistory(attempt,history),outcomes=performanceOutcomes(attempt);
 const currentIndex=rows.findIndex(row=>row.id===attempt.id),previous=rows[currentIndex-1];
 const delta=previous?attempt.accuracy-previous.accuracy:null,met=attempt.accuracy>=target;
 const groups=[{label:'Matched',value:outcomes.matched,kind:'matched'},{label:'Did not match',value:outcomes.mismatched,kind:'mismatched'},{label:'Processing error',value:outcomes.errors,kind:'errors'}];
 const x=(index:number)=>rows.length===1?330:55+index*550/(rows.length-1),y=(score:number)=>205-score*1.7;
 return <div className="performance-dashboard">
 <section className="run-result-summary performance-summary" aria-label="Recorded run results">
 <div className="performance-score combined-score"><span className="eyebrow">AI ACCURACY</span><h3>{attempt.accuracy}%</h3><p>{outcomes.matched} out of {outcomes.total} decisions correct</p><small>A correct decision matches the case rubric's action and any required target. Processing errors count in the existing score.</small><span className={'performance-target '+(met?'target-met':'')}>{met?'Learning target reached':Math.max(0,target-attempt.accuracy)+' points to target'} / {target}% target</span></div>
 <dl className="performance-kpis"><div><dt>Records evaluated</dt><dd>{outcomes.total}</dd><small>This saved run</small></div><div><dt>Need review</dt><dd>{outcomes.total-outcomes.matched}</dd><small>Includes processing errors</small></div><div><dt>Processing errors</dt><dd>{attempt.errors}</dd><small>Included in the recorded score</small></div><div><dt>Change from previous run</dt><dd className="metric-delta">{delta===null?'First run':(delta>0?'+':'')+delta+' pp'}</dd><small>{delta===null?'No earlier comparable run':previous.accuracy+'% previously / percentage points'}</small></div></dl>
 </section>
 {attempt.mode==='demo'&&<p className="performance-mode-note"><strong>Simulated results.</strong> These scores come from demonstration mode, not a live AI assessment.</p>}
 <div className="performance-charts">
 <section className="performance-chart" aria-labelledby={id+'-trend'}><header><h3 id={id+'-trend'}>Accuracy over attempts</h3><p>Saved runs for this case, in {attempt.mode==='demo'?'simulation':'live AI'} mode.</p></header>
 <svg className="accuracy-trend" viewBox="0 0 640 240" role="img" aria-labelledby={id+'-trend '+id+'-chart-description'}><desc id={id+'-chart-description'}>{rows.map((row,i)=>'Attempt '+(row.completed_index||row.attempt_number||i+1)+': '+row.accuracy+'%').join('. ')}. Learning target: {target} percent.</desc>
 {[0,50,100].map(value=><g key={value}><line x1="55" x2="605" y1={y(value)} y2={y(value)} className="chart-grid"/><text x="42" y={y(value)+4} textAnchor="end">{value}%</text></g>)}
 <line x1="55" x2="605" y1={y(target)} y2={y(target)} className="chart-target"/>
 {rows.length>1&&<polyline points={rows.map((row,i)=>x(i)+','+y(row.accuracy)).join(' ')} className="chart-trend-line"/>}
 {rows.map((row,i)=><g key={row.id}><circle cx={x(i)} cy={y(row.accuracy)} r={row.id===attempt.id?7:4} className={row.id===attempt.id?'chart-point selected':'chart-point'}/>{(rows.length<=8||row.id===attempt.id)&&<text x={x(i)} y={y(row.accuracy)-13} textAnchor="middle" className="chart-score-label">{row.accuracy}%</text>}</g>)}<text x="55" y="232">Earlier</text><text x="605" y="232" textAnchor="end">Latest</text></svg>
 <p className="chart-legend"><span className="legend-actual"/>Recorded accuracy <span className="legend-target"/>{target}% learning target</p>
 {rows.length===1&&<p className="chart-empty-note">One run recorded. Test again to see your progress.</p>}
 <div className="trend-attempts" aria-label="View a saved run">{rows.map((row,i)=><button type="button" key={row.id} aria-pressed={row.id===attempt.id} onClick={()=>onSelect(row)}>Attempt {row.completed_index||row.attempt_number||i+1}<strong>{row.accuracy}%</strong><span>{row.results.filter(result=>result.match).length}/{row.results.length} matched</span></button>)}</div>
 </section>
 <section className="performance-chart" aria-labelledby={id+'-outcomes'}><header><h3 id={id+'-outcomes'}>Record outcomes</h3><p>How the {outcomes.total} records in this run performed.</p></header>
 {outcomes.total>0?<div className="outcome-stacked-bar" role="img" aria-label={groups.map(group=>group.label+': '+group.value).join('. ')}>{groups.filter(group=>group.value>0).map(group=><span key={group.kind} className={'outcome-'+group.kind} style={{width:100*group.value/outcomes.total+'%'}}/>)}</div>:<p>No record outcomes were saved for this run.</p>}
 <dl className="outcome-legend">{groups.map(group=><div key={group.kind}><dt><span className={'outcome-swatch outcome-'+group.kind}/>{group.label}</dt><dd>{group.value}<small>{outcomes.total?Math.round(100*group.value/outcomes.total)+'%':'No records'}</small></dd></div>)}</dl>
 <p className="chart-reading-note">Processing errors are shown separately here and still count in the existing accuracy score. A match compares the action and any required target; it does not assess the quality of the reasoning.</p>
 </section></div>
 </div>;
}

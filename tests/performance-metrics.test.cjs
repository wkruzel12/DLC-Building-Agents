const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {performanceHistory,performanceOutcomes}=require('../src/lib/performance-metrics.ts');
const run=(id,extra={})=>({id,case_id:'case-a',mode:'openai',created_at:'2026-01-01',attempt_number:1,accuracy:60,results:[],...extra});
test('performance history excludes other cases and simulated runs, deduplicates and retains the selected saved score',()=>{
 const current=run('current',{created_at:'2026-01-03',accuracy:80,scenario_title:'Shared title'}),before=JSON.stringify(current);
 const rows=performanceHistory(current,[run('other-case',{case_id:'case-b',scenario_title:'Shared title'}),run('unknown-case',{case_id:undefined,scenario_title:'Shared title'}),run('simulated',{mode:'demo'}),run('previous'),run('current',{accuracy:99})]);
 assert.deepEqual(rows.map(row=>row.id),['previous','current']);assert.equal(rows[1].accuracy,80);assert.equal(JSON.stringify(current),before);
});
test('legacy runs require a matching known case title; a first run has only one actual data point',()=>{
 const current=run('current',{case_id:undefined,scenario_title:'Stock review'});
 assert.deepEqual(performanceHistory(current,[run('same',{case_id:undefined,scenario_title:'Stock review'}),run('unknown',{case_id:undefined}),run('other',{case_id:undefined,scenario_title:'Hiring'})]).map(row=>row.id),['same','current']);
 assert.equal(performanceHistory(run('single',{case_id:undefined}),[]).length,1);
});
test('outcome chart separates processing errors from mismatches without changing the grade or exposing answers',()=>{
 const current=run('current',{accuracy:25,results:[{match:true,decision:'advance'},{match:false,decision:'reject'},{match:false,decision:'error'},{match:false,decision:'advance',error:'Provider failed',expected_decision:'PRIVATE_ANSWER'}]});
 const before=JSON.stringify(current),outcomes=performanceOutcomes(current);
 assert.deepEqual(outcomes,{matched:1,errors:2,mismatched:1,total:4});assert.equal(outcomes.matched+outcomes.errors+outcomes.mismatched,outcomes.total);assert.equal(JSON.stringify(current),before);assert.ok(!JSON.stringify(outcomes).includes('PRIVATE_ANSWER'));
 assert.deepEqual(performanceOutcomes(run('empty')),{matched:0,errors:0,mismatched:0,total:0});
});

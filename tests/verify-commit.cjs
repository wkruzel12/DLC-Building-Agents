// Run after staging: verifies the exact Git index, without printing secret values.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const binary=process.env.GIT_BINARY||(process.platform==='win32'&&fs.existsSync('C:\\Program Files\\Git\\cmd\\git.exe')?'C:\\Program Files\\Git\\cmd\\git.exe':'git');
function git(args){const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});if(result.status!==0)throw Error('Unable to inspect the Git index.');return result.stdout;}
const files=git(['ls-files','-z']).split('\0').filter(Boolean);
if(!files.length)throw Error('No staged files to audit.');
const knownSecrets=fs.existsSync('.env.local')?[...fs.readFileSync('.env.local','utf8').matchAll(/^(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)=(.+)$/gm)].map(match=>match[1].trim()).filter(value=>value&&!value.startsWith('YOUR_')):[];
const patterns=[/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/,/\bsb_secret_[A-Za-z0-9_-]{12,}\b/,/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for(const file of files){
 if(/(^|\/)(\.private-cases|test-cases)(\/|$)/.test(file)||/\.pdf$/i.test(file))throw Error('Private case material is tracked: '+file);
 if(/(^|\/)(node_modules|\.next|\.npm-cache|\.test-artifacts|\.git)(\/|$)/.test(file)||(/(^|\/)\.env(?:\.|$)/.test(file)&&file!=='.env.example'))throw Error('Excluded local file is tracked: '+file);
 const source=git(['show',':'+file]);
 if(knownSecrets.some(value=>source.includes(value))||patterns.some(pattern=>pattern.test(source)))throw Error('Potential credential found in staged file: '+file);
}
let assets=0;
const notes=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8')).answer_key.map(item=>item.note).filter(Boolean);
function scan(directory){if(!fs.existsSync(directory))return;for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())scan(file);else if(file.endsWith('.js')){assets++;const source=fs.readFileSync(file,'utf8');if([...knownSecrets,...notes].some(value=>source.includes(value)))throw Error('Private server data found in browser asset: '+file);}}}
scan('.next/static');
console.log('Secret audit passed: '+files.length+' tracked/staged files; '+assets+' browser JavaScript assets. No configured secret keys, token patterns, private grading notes in assets, generated directories, or local env files.');

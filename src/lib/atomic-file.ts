import 'server-only';
import {rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';

// Windows may briefly lock the destination while expiry cleanup reads it.
// Retry replacement; never delete an existing case or transcript as a fallback.
export async function atomicReplace(source:string,destination:string){
 for(let attempt=0;;attempt++)try{await rename(source,destination);return;}catch(error){
  if(attempt>=4||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code||''))throw error;
  await setTimeout(10*2**attempt);
 }
}

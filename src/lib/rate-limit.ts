import 'server-only';
import {RunError} from './openai-errors';

// Best-effort, per server instance. It caps accidental bursts of paid AI calls from one
// instructor; it is not a hard quota across instances (use a database function for that).
const buckets=new Map<string,number[]>();
export function limitRate(key:string,limit:number,windowMs:number,now=Date.now()){
 const recent=(buckets.get(key)||[]).filter(time=>now-time<windowMs);
 if(recent.length>=limit){buckets.set(key,recent);throw new RunError('You have reached the limit for this action. Wait a few minutes and try again.',429);}
 recent.push(now);buckets.set(key,recent);
 if(buckets.size>5000)for(const [name,times] of buckets)if(!times.some(time=>now-time<windowMs))buckets.delete(name);
}
export function resetRateLimits(){buckets.clear();}

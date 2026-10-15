import 'server-only';

export function localDemoEnabled(){
 return process.env.NODE_ENV==='development';
}

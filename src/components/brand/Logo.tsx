// Proofwork mark: two bars (Extract, Check) and a gold check (the final call).
// Gold appears only on the check, so it always signals a verified decision.
export function ProofworkMark({size=28,reversed=false}:{size?:number;reversed?:boolean}){
 const tile=reversed?'#FFFFFF':'#1E2A38',bar=reversed?'#1E2A38':'#FFFFFF',second=reversed?'#4A6585':'#8FA3B8',check=reversed?'#B89A5E':'#C9AE73';
 return <svg className="proofwork-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <rect width="40" height="40" rx="8" fill={tile}/>
  <rect x="9" y="10" width="22" height="4" rx="2" fill={bar}/>
  <rect x="9" y="18" width="15" height="4" rx="2" fill={second}/>
  <path d="M10 28.5 L13.5 32 L20.5 25" stroke={check} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}

export function ProofworkLogo({size=28}:{size?:number}){
 return <span className="proofwork-logo"><ProofworkMark size={size}/><span className="proofwork-wordmark">Proofwork</span></span>;
}

'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useLab} from '../lab/FlowProvider';
import {useRole} from '../lab/useRole';
import {Icon} from '../lab/ui';
import {GuideProvider} from './GuideContext';
import {GuidePanel} from './GuidePanel';

const tabs=[{href:'/instructor',label:'Class dashboard'},{href:'/instructor/new',label:'Create case'}];

// Shared frame for instructor pages: tabs plus Proofwork Guide.
export function InstructorShell({children}:{children:React.ReactNode}){
 const path=usePathname(),lab=useLab(),role=useRole(lab.user?.id);
 if(!role.loaded)return <section className="empty-state" role="status"><span className="spinner"/><p>Checking your access…</p></section>;
 if(!role.instructor)return <section className="card empty-state"><span className="icon-block"><Icon name="shield" size={26}/></span><h2>This page is for instructors.</h2><p>{lab.local?'Instructor pages run in the signed-in deployment, where class attempts are saved.':'Ask your administrator to add your verified TCU email to the instructor list.'}</p></section>;
 return <GuideProvider>
  <nav className="instructor-tabs" aria-label="Instructor pages">{tabs.map(tab=>{const active=tab.href==='/instructor'?path==='/instructor':path.startsWith(tab.href);return <Link key={tab.href} href={tab.href} aria-current={active?'page':undefined} className={active?'is-active':''}>{tab.label}</Link>;})}</nav>
  {children}
  <GuidePanel/>
 </GuideProvider>;
}

import {learningTarget} from '@/lib/learning-config';
import './globals.css';
import './agent-theme.css';
import './performance-dashboard.css';
import './visual-polish.css';
import './clean-results.css';
import './instructor.css';
import './proofwork.css';
import {GeistSans} from 'geist/font/sans';
import {GeistMono} from 'geist/font/mono';
import type {Metadata} from 'next';
import {FlowProvider} from '@/components/lab/FlowProvider';
import {LabShell} from '@/components/lab/LabShell';
import {localDemoEnabled} from '@/lib/local-demo';
export const metadata:Metadata={title:{default:'Proofwork',template:'%s | Proofwork'},description:'Build AI agents. Prove they make the right call.',applicationName:'Proofwork'};
export const dynamic='force-dynamic';
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={GeistSans.variable+' '+GeistMono.variable}><body><FlowProvider target={learningTarget()} local={localDemoEnabled()} demo={process.env.DEMO_MODE==='true'}><LabShell>{children}</LabShell></FlowProvider></body></html>}

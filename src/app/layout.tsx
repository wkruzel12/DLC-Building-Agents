import {learningTarget} from '@/lib/learning-config';
import './globals.css';
import './agent-theme.css';
import type {Metadata} from 'next';
import {FlowProvider} from '@/components/lab/FlowProvider';
import {LabShell} from '@/components/lab/LabShell';
import {localDemoEnabled} from '@/lib/local-demo';
export const metadata:Metadata={title:'Agent Lab | AI Workbench',description:'Build, evaluate, and improve AI decision agents'};
export const dynamic='force-dynamic';
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><FlowProvider target={learningTarget()} local={localDemoEnabled()} demo={process.env.DEMO_MODE==='true'}><LabShell>{children}</LabShell></FlowProvider></body></html>}

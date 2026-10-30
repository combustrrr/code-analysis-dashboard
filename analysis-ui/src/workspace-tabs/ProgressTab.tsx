import type {ReactNode} from 'react';
import {Alert} from '../ui';
export default function ProgressTab({children}:{children?:ReactNode}){return <section className="workspace-tab workspace-tab-progress analysis-progress-screen"><header><span className="eyebrow">LIVE ANALYSIS</span><h1>Analysis progress</h1><p>Follow the active request without replacing the published evidence workspace.</p></header>{children||<Alert type="info" showIcon title="No active analysis" description="Return to the project overview to review the current report or start a new analysis."/>}</section>}

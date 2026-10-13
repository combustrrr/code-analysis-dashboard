import { Alert, Button, ConfigProvider, Space, Typography, theme } from 'antd';
import { ArrowDownOutlined, ArrowRightOutlined, BranchesOutlined, CodeOutlined, FileSearchOutlined, GithubOutlined, RadarChartOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { useLaunchAuth } from './useLaunchAuth';
import { AppearanceToggle, useAppearance } from './Appearance';
import './landing.css';

type Auth = ReturnType<typeof useLaunchAuth>;

export function LandingPage({ auth, onStart, accessError, workspaceRequested = false }: { auth: Auth; onStart: () => void; accessError?: string; workspaceRequested?: boolean }) {
  const { appearance } = useAppearance();
  const signedIn = Boolean(auth.session) && !accessError;
  const primaryAction = signedIn ? onStart : auth.signIn;
  const primaryLabel = signedIn ? 'Open workspace' : 'Sign in with GitHub';

  return <ConfigProvider theme={{ algorithm: appearance === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
    <main className="landing-page landing-v2">
      <div className="landing-wrap">
        <nav className="landing-nav" aria-label="Main navigation">
          <a className="landing-brand" href="#top" aria-label="Code Analysis home"><span className="landing-brand-mark"><RadarChartOutlined /></span><span>Code Analysis</span></a>
          <div className="landing-nav-right">
            <span className="landing-nav-note">READ-ONLY ANALYSIS</span>
            <AppearanceToggle className="landing-theme-toggle" />
            {signedIn && auth.session && <span className="landing-user">{auth.session.login}</span>}
            <Button className="landing-nav-cta" icon={signedIn ? undefined : <GithubOutlined />} onClick={primaryAction} disabled={!signedIn && !auth.available}>{primaryLabel}</Button>
          </div>
        </nav>

        <section className="landing-hero" id="top" aria-labelledby="landing-title">
          <div className="landing-copy">
            <div className="landing-kicker"><span className="landing-kicker-dot" /> SECURITY FINDINGS, WITH THEIR RECEIPTS</div>
            <Typography.Title id="landing-title">Know what your code is carrying.</Typography.Title>
            <Typography.Paragraph>Run isolated analysis against a branch, pull request, or exact commit. Then inspect each finding with the scanner evidence and source revision still attached.</Typography.Paragraph>
            <Space wrap className="landing-actions">
              <Button type="primary" size="large" icon={signedIn ? <ArrowRightOutlined /> : <GithubOutlined />} onClick={primaryAction} disabled={!signedIn && !auth.available}>{signedIn ? 'Open workspace' : 'Sign in with GitHub'}</Button>
              <a className="landing-secondary-action" href="#workflow">See how it works <ArrowDownOutlined /></a>
            </Space>
            {!signedIn && <p className="landing-auth-hint">First time here? Sign in with GitHub—no separate app account is needed. A dashboard admin must invite your account to combustrrr/code-analysis-dashboard; accept the invitation, then sign in.</p>}
            {workspaceRequested && !accessError && <p className="landing-auth-hint">Sign in with an approved GitHub account to open the repository workspace. Your sign-in stays active in this tab.</p>}
            {!auth.available && !auth.error && <p className="landing-auth-hint">GitHub sign-in is temporarily unavailable.</p>}
            {(accessError || auth.error) && <Alert className="landing-error" type="error" showIcon title={accessError ? 'Dashboard access' : 'GitHub sign-in'} description={accessError || auth.error} />}
          </div>

          <aside className="landing-visual" aria-label="Illustrative finding report preview">
            <div className="landing-visual-topline"><span>REPORT ANATOMY</span><span>ILLUSTRATIVE · NOT LIVE DATA</span></div>
            <article className="evidence-card">
              <header className="evidence-card-header"><div><span className="evidence-label">SOURCE REVISION</span><strong><BranchesOutlined /> sample/service-api <i>main</i></strong></div><span className="evidence-sha">8d41b72</span></header>
              <div className="evidence-path"><CodeOutlined /><span>src/auth/session.ts</span><b>42</b></div>
              <div className="evidence-code"><span>40</span><code>export function createSession() {'{'}</code><span>41</span><code>  const token = generateToken();</code><span className="evidence-line-current">42</span><code className="evidence-code-current">  return sign(payload, token);</code><span>43</span><code>{'}'}</code></div>
              <div className="evidence-finding"><div className="evidence-severity">HIGH <span>REVIEW</span></div><div><strong>Review token generation</strong><p>Finding linked to its source location and retained scanner observation.</p></div><FileSearchOutlined /></div>
              <footer className="evidence-provenance"><span><SafetyCertificateOutlined /> EXACT COMMIT</span><span><ThunderboltOutlined /> ISOLATED RUN</span><span><RadarChartOutlined /> PUBLISHED REPORT</span></footer>
            </article>
            <div className="landing-visual-caption"><span /> Every result should answer: what ran, where, and against which revision.</div>
          </aside>
        </section>

        <div className="landing-proof" aria-label="Analysis safeguards">
          <span><SafetyCertificateOutlined /> Findings keep source and run provenance</span>
          <span><ThunderboltOutlined /> Source executes in isolated scanner jobs</span>
          <span><RadarChartOutlined /> Missing evidence stays visible</span>
        </div>

        <section className="landing-workflow" id="workflow" aria-labelledby="workflow-title">
          <div className="landing-section-heading"><div><span className="landing-kicker">FROM SOURCE TO EVIDENCE</span><Typography.Title id="workflow-title" level={2}>A clear path from code to context.</Typography.Title></div><p>No automatic scans on page load. You choose the target; the dashboard follows the run and shows the published result.</p></div>
          <div className="landing-steps">
            <article className="landing-step"><span className="landing-step-index">01</span><div className="landing-step-icon"><GithubOutlined /></div><h3>Connect a repository</h3><p>Sign in and choose an execution repository you administer. Review any proposed setup before confirming it.</p></article>
            <article className="landing-step"><span className="landing-step-index">02</span><div className="landing-step-icon"><BranchesOutlined /></div><h3>Choose what to analyze</h3><p>Select a branch, pull request, or full commit SHA. Each run records the exact source revision.</p></article>
            <article className="landing-step"><span className="landing-step-index">03</span><div className="landing-step-icon"><FileSearchOutlined /></div><h3>Follow the evidence</h3><p>See which scanners completed, inspect findings, and open the source and workflow evidence behind them.</p></article>
          </div>
        </section>

        <section className="landing-boundary" aria-label="Security and access boundaries">
          <div className="landing-boundary-mark"><SafetyCertificateOutlined /></div>
          <div><span className="landing-kicker">BUILT AROUND TRUST BOUNDARIES</span><h2>Your source stays read-only.</h2><p>Scans use an immutable checkout. Scanner execution does not receive report-publication or vendor credentials. Incomplete coverage is shown as incomplete—not quietly counted as clean.</p></div>
          <Button type="primary" onClick={primaryAction} disabled={!signedIn && !auth.available}>{signedIn ? 'Open workspace' : 'Get started'} <ArrowRightOutlined /></Button>
        </section>

        <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="landing-brand-mark"><RadarChartOutlined /></span><span>Code Analysis</span></a><span>Read-only analysis. Evidence you can trace.</span><span>Dashboard access is limited to approved GitHub collaborators.</span></footer>
      </div>
    </main>
  </ConfigProvider>;
}

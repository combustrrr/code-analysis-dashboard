import { Button, Card, Col, ConfigProvider, Row, Space, Tag, Typography, theme } from 'antd';
import { GithubOutlined, RadarChartOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { useLaunchAuth } from './useLaunchAuth';

type Auth = ReturnType<typeof useLaunchAuth>;

export function LandingPage({ auth, onStart }: { auth: Auth; onStart: () => void }) {
  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    <main className="landing-page">
      <nav className="landing-nav"><div className="landing-brand"><RadarChartOutlined /> Code Analysis</div><Space>
        {auth.session ? <><span className="landing-user">{auth.session.login}</span><Button onClick={onStart}>Open workspace</Button></> : <Button icon={<GithubOutlined />} onClick={auth.signIn} disabled={!auth.available}>Sign in with GitHub</Button>}
      </Space></nav>
      <section className="landing-hero">
        <div className="landing-kicker"><Tag color="cyan">READ-ONLY SECURITY INTELLIGENCE</Tag></div>
        <Typography.Title>Know what your code is carrying.</Typography.Title>
        <Typography.Paragraph>Connect a GitHub repository, run every applicable analysis lane, and turn noisy scanner output into one evidence-backed dashboard.</Typography.Paragraph>
        <Space wrap className="landing-actions">
          <Button type="primary" size="large" icon={<GithubOutlined />} onClick={auth.session ? onStart : auth.signIn} disabled={!auth.available}> {auth.session ? 'Connect a repository' : 'Sign in with GitHub'}</Button>
          <Button size="large" ghost onClick={onStart}>Explore the workflow</Button>
        </Space>
        {auth.error && <Typography.Paragraph className="landing-error">{auth.error}</Typography.Paragraph>}
        <div className="landing-proof"><span><SafetyCertificateOutlined /> Exact commit provenance</span><span><ThunderboltOutlined /> Isolated scanner jobs</span><span><RadarChartOutlined /> One current report per repository</span></div>
      </section>
      <section className="landing-grid" aria-label="Platform capabilities"><Row gutter={[18, 18]}>
        <Col xs={24} md={8}><Card bordered={false}><SafetyCertificateOutlined /><Typography.Title level={3}>Evidence, not guesses</Typography.Title><Typography.Paragraph>Every finding retains its scanner, revision, workflow run, and source location.</Typography.Paragraph></Card></Col>
        <Col xs={24} md={8}><Card bordered={false}><ThunderboltOutlined /><Typography.Title level={3}>One guided connection</Typography.Title><Typography.Paragraph>GitHub sign-in guides repository access, workflow installation, and readiness checks in one flow.</Typography.Paragraph></Card></Col>
        <Col xs={24} md={8}><Card bordered={false}><RadarChartOutlined /><Typography.Title level={3}>Scanner coverage</Typography.Title><Typography.Paragraph>Applicable local and vendor-backed scanners report clearly when they complete, fail, or need configuration.</Typography.Paragraph></Card></Col>
      </Row></section>
      <footer className="landing-footer">Your source repository stays read-only. Analysis artifacts are retained separately from source code.</footer>
    </main>
  </ConfigProvider>;
}

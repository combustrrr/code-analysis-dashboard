# Free services for this dashboard

Decision reviewed 2026-09-12 using the [Ossium directory](https://ossium.in/oss-perks)
and primary provider documentation. Directory listings are discovery leads, not
proof that this account has an entitlement. No subscription or credit plan was
activated by this change.

## In use

| Component | Purpose | Operating boundary |
|---|---|---|
| Cloudflare Workers | GitHub auth, authorization and API/report delivery | Existing deployment; source analysis stays in Actions |
| Workers Logs | Sanitized API failure diagnostics and sampled successful requests | One custom event at most per API request; no OAuth events |
| Built-in Workers metrics | Request volume, errors, CPU and resource-limit investigation | View in the existing Worker dashboard; no new tracking script |
| GitHub Pages | Static Ant Design application | UI builds only; no report data bundled |
| Public GitHub Actions and Releases | Scanner execution, bounded request queue, current reports | Existing quotas and retention still apply |

Workers Free has a 100,000-request daily account limit. Workers Logs on Free includes
200,000 events daily with three-day retention. These are shared account limits, not
reserved capacity. Diagnostics emits all API errors and samples 5% of successful API
requests, at most one application event per request. Metrics remain useful when logs
are sampled. This does not prevent request-quota exhaustion or guarantee availability.
See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## Diagnostics operation

Open Cloudflare dashboard -> Workers & Pages -> code-analysis-launcher -> Observability.
Filter custom events by event=analysis_api, category, status and request_id. Clients
receive X-Request-ID; it is safe to share that opaque reference for troubleshooting.
Elapsed time covers response setup, not complete streaming download duration.

Automatic invocation logs and traces are disabled. The application never emits
OAuth callback events, request URLs/query strings, user/repository identifiers,
headers, cookies, bodies, tokens, source or finding text. Custom fields are bounded
category/method, status, elapsed_ms and a generated request ID. Cloudflare still owns
platform metadata; do not enable full request tracing or payload logging casually.
Set SAFE_API_LOGS=false to stop custom logs without changing authorization. Observability
failure must not become authority to bypass collaborator or repository access checks.
No frontend session replay or third-party analytics SDK is installed.

## OSS perks assessed

| Program | Decision for this application |
|---|---|
| [Cloudflare Project Alexandria](https://www.cloudflare.com/en-gb/lp/project-alexandria/) | Optional future credits if free quotas become insufficient. Eligibility and acceptance are discretionary; requires a valid payment method. Not activated. |
| [Sonar OSS plan](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans) | Most relevant next entitlement: offers branch/PR analysis for eligible open-source organizations. Could address current branch_entitlement. Existing organization access has not changed; keep scanner partial until real evidence succeeds. |
| [Sentry OSS sponsorship](https://sentry.io/for/open-source/) | Potential future browser error monitoring. Not needed for current Worker diagnostics; no account, SDK, replay or telemetry export added. Sponsorship is not assumed approved. |
| Cloudflare Turnstile | Free bot checks exist, but adding a challenge to an already collaborator-gated launch flow is not currently necessary. Reconsider for public onboarding. |
| R2, D1, KV and Queues | No new storage or scheduler provisioned. Current GitHub queue and Release storage already satisfy this instance; do not duplicate state just because a free tier exists. |
| Additional analytics, search, hosting and CI perks | No migration needed for this request. Current filters run locally and current hosting/CI already work. |

Provider plan changes and application approvals require verification at activation.
No credit card, paid upgrade, external message or upstream installation was submitted.
This change does not remove Sonar/posture blockers or prove independent public onboarding.

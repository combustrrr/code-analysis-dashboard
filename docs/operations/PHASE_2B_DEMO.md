# Phase 2B demonstration and closeout

## Verified baseline on 2026-10-20

- The trusted registry contains exactly Kavach-AgenticSOC (`1267340546`),
  Agentic-Kibana (`1278177697`), and dashboard self-analysis (`1360051890`).
- Worker secret bindings are present for `GITHUB_CLIENT_SECRET`,
  `GITHUB_APP_PRIVATE_KEY`, `SESSION_KEY`, and `WORKER_API_TOKEN`; values were not read.
- The production GitHub Environment contains the Cloudflare deployment bindings and
  `WORKER_API_TOKEN`. Repository Actions contains the configured R2 and vendor secret
  names; values were not read.
- Worker version `3e84ac7e-bf28-4e0f-aa61-2e9348717c6d` is at 100 percent traffic.
  Pages run `39296740277` successfully deployed the current frontend baseline.
- GitHub App `4893614` is owned by `combustrrr`. Runtime installation tokens are narrowed
  to read access, but the App registration currently advertises Actions, contents, and
  workflows write permissions. The owner must reduce those registration permissions and
  accept the installation update before the App can be described as least-privilege.
  Installation listing was not available to the GitHub CLI user token, so installation
  scope is verified indirectly by successful fixed-repository App reads.

## Demonstration checklist

1. Sign in with an authorized GitHub collaborator account.
2. Open **Projects** and choose one of the three configured projects. Confirm that this
   does not queue analysis.
3. Choose a branch, open pull request, or full 40-character commit SHA. Select only
   channels offered by the trusted profile.
4. Review the resolved immutable SHA, source/fork/base provenance, tooling revision,
   channel selection, and retained-evidence notice.
5. Select **Confirm and queue analysis** once. A `202` means queued, not completed.
6. Follow queue, scanner, collection, and publication states. Keep the previous valid
   report visible if the new request fails.
7. Open the published or partial report and confirm analyzed SHA, producing workflow run
   and attempt, channel completeness, limitations, and source-safe behavior.

Use one explicitly approved configured public target/revision for the live demonstration.
Fixtures cover branch, open-PR, and full-SHA variants; do not spend production quota by
running every combination. A pull-only collaborator path must not be called live-verified
until a pull-only collaborator performs it successfully.

## Known boundaries

Workflow reachability and profile declaration do not prove vendor credentials or scanner
completion. Missing, deferred, unavailable, and failed channels remain explicit. GitHub
Actions artifacts in this public service repository are public even when the dashboard
requires sign-in. This deployment is a fixed three-project service, not an arbitrary
client installer or private-source platform.

## Reversible shutdown if the demonstration is declined

1. Disable Worker scan admission and scheduled coordinator execution.
2. Revoke the GitHub App, Worker, and vendor credentials without printing their values.
3. Choose and document report/artifact retention or deletion under the existing policy.
4. Leave source repositories unchanged; do not add shutdown infrastructure or upstream
   commits merely to retire the service.

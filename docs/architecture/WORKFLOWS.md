# Production workflow architecture

The dashboard has one analysis entry point. The signed-in application admits an
immutable `analysis-request-v4` record to the Durable Object and sends a best-effort
wake to `code-analysis-coordinator.yml`. The coordinator claims that request, starts
the applicable scanner lanes in parallel, publishes once behind a per-project fence,
and records the terminal state. A 15-minute schedule is recovery only; it never creates
analysis work.

```text
Run analysis button
  -> Worker authorization, SHA resolution, durable admission
  -> Run analysis coordinator
       -> vendor lane         (only selected vendor scanners)
       -> portable lane       (portable project profile)
       -> configured lane     (agentic-soc project profile)
       -> per-project publication fence
  -> Ready / Needs attention in the application
```

Only one of the portable and configured source producers runs for a request. Scanner
jobs inside the selected producer are independent jobs and therefore run concurrently.
Source-executing jobs receive neither vendor nor publication credentials.

## Active workflows

| File | Trigger | Role |
|---|---|---|
| `code-analysis-coordinator.yml` | Worker wake; 15-minute recovery schedule | Sole production analysis coordinator |
| `reusable-source.yml` | `workflow_call` | Portable-profile source scanners |
| `reusable-source-full.yml` | `workflow_call` | Configured agentic-soc source scanners |
| `reusable-vendor.yml` | `workflow_call` | Credential-isolated vendor evidence |
| `11-source-analysis.yml` | `workflow_call` | Generated compatibility surface; not an admission path |
| `12-scanner-diagnostics.yml` | Manual | Operator-only scanner access diagnostics |
| `preferred-branch-analysis.yml` | Manual | Optional administrator batch admission for configured preferred branches |
| `09-coderabbit-advisory-refresh.yml` | CodeRabbit review event | Retains separate PR advisory evidence |
| `06-canary-validation.yml` | Canary-source changes | Validates scanner rule coverage |
| `13-scanner-updates.yml` | Daily; manual | Reconciles scanner dependency pins |
| `14-scanner-compatibility.yml` | Pull request; manual | Validates scanner and workflow compatibility |
| `15-tooling-rollout.yml` | Main tooling change; daily; manual | Proposes an immutable tooling-pin promotion and waits boundedly for its exact-head check |
| `pages.yml` | Main UI change; manual | Builds and deploys GitHub Pages |
| `worker-deploy.yml` | Main Worker change; pull request | Validates and deploys the Worker |
| `execution-cutover.yml` | Manual | Protected queue/reset cutover procedure |

The former manual `01`-`08` analysis chain and standalone `16`-`24` scanner entry
points were retired. They were not used by the application and presented competing,
partially overlapping ways to start analysis. Core scanner recipes now live under
`config/code-analysis/workflow-templates/`; they are generator inputs, not runnable
Actions workflows. Community scanner jobs are maintained in
`scripts/code_analysis/community_workflow.py`.

`11-source-analysis.yml` and `12-scanner-diagnostics.yml` are generated with
`python -m scripts.code_analysis.generate_source_workflow`. The reusable source
workflows are generated with `python -m scripts.code_analysis.generate_reusable_workflows`.

## Concurrency and recovery

- Durable admission happens before the Worker attempts a GitHub dispatch.
- Each request/SHA receives independent channel leases with generation and token fencing.
- Scanner lanes run concurrently; there is no global analysis FIFO.
- Publication alone is serialized per project so two attempts cannot overwrite one another.
- An older accepted revision cannot replace a newer accepted revision.
- The recovery schedule claims only already accepted work if the immediate wake failed.
- The optional preferred-branch batch is manual and does not silently create periodic scans.

## Safety contract

- Every source checkout is pinned to the resolved immutable SHA and uses
  `persist-credentials: false`.
- Source jobs have read-only repository permissions and no vendor or publication secrets.
- Vendor credentials are confined to `reusable-vendor.yml`.
- Publication credentials are confined to the coordinator's trusted publication job.
- No workflow writes findings, commits, comments, checks, or SARIF to analyzed sources.
- Generated reports retain source, SHA, request, workflow run/attempt, tooling, and profile
  provenance. Incomplete scanner evidence remains explicit.

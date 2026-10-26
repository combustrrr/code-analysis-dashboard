---
title: CI and CD
description: Repository validation, protected promotion, and production deployment paths.
---

# Continuous integration and delivery

## Scope

The repository uses one general CI workflow and three narrowly scoped CD paths.
CI never receives deployment or scanner-vendor credentials. Deployment credentials
remain confined to their protected jobs and environments.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`.
Its independent jobs validate:

- Python service and scanner-contract tests;
- generated workflow and workflow-security policy;
- deployment isolation contracts;
- launcher authentication, report, and durable-queue behavior;
- locked UI installation and production dependency audit; and
- UI unit tests, TypeScript validation, and production build.

The final `CI` job succeeds only when every lane succeeds. Branch protection requires
that stable status together with `Scanner compatibility` before ordinary pull requests
can merge.

## Continuous delivery

| Changed surface | Workflow | Destination |
|---|---|---|
| `analysis-ui/**` | `pages.yml` | GitHub Pages production environment |
| `analysis-launcher/**` or queue contract | `worker-deploy.yml` | Cloudflare Worker production environment |
| Scanner workflows, profiles, adapters, or pins | `15-tooling-rollout.yml` | Protected immutable tooling promotion PR |

Pages builds the application without report assets and retains the current asset list
from up to twenty preceding successful deployments. This bounded compatibility window
keeps lazy-loaded chunks available to browser tabs that still hold a recently cached
application shell. Historical artifacts can expire or be removed independently; the
retention step records and skips those unavailable runs instead of blocking publication
of the newly validated application. Worker deployment runs tests, deployment validation,
and a Wrangler dry run before the production job. Tooling changes pass compatibility
tests and are adopted through an exact-head promotion instead of being executed directly
from an unvalidated commit.

Documentation-only changes run CI but do not trigger a production deployment.

## Failure and rollback

- A failed CI lane blocks the aggregate `CI` status; do not bypass it for an ordinary PR.
- A failed Pages or Worker validation job prevents its deployment job from starting.
- A failed tooling validation retains the previously adopted tooling revision.
- Roll back application or Worker changes by reverting the responsible commit and
  allowing the corresponding scoped CD workflow to validate and redeploy it.
- Roll back scanner tooling through the documented procedure in
  [scanner maintenance](SCANNER-MAINTENANCE.md); never relabel old evidence.

## Verification

For each change, retain the CI run URL and any applicable Pages, Worker, or tooling
promotion run. After deployment, verify the public Pages response and the relevant
application health/readiness behavior rather than treating a successful build alone as
production proof.

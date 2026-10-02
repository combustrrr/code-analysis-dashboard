# Code Analysis Dashboard - Roadmap & Architectural Improvements

This document outlines planned improvements to scale the dashboard, increase security coverage, and mitigate CI/CD resource bottlenecks.

## Current status (2026-10-02)

The Kavach-focused service is deployed with GitHub Actions for scanner execution,
Cloudflare Workers for authentication/API delivery, and Cloudflare R2 for temporary
producer artifacts and current report assets. The roadmap below is future work, not a
description of capabilities currently promised to users.

Priority order:

1. Keep the Kavach path reliable and truthful: verify publication/channel evidence,
   preserve read-only source boundaries, and keep free-tier limits.
2. Add triage and suppression only with durable audit history and explicit policy review.
3. Expand scanner coverage through isolated, contract-tested adapters.
4. Consider DAST/mobile analysis, compliance views, and broader onboarding only after
   quota, authorization, and isolation acceptance is proven.

## 1. Scanner Expansion (Defense-in-Depth) - Planned
To further increase coverage beyond the currently integrated AI agents (Codex, Flounder, Alibaba OCR, VulnAgent) and standard SAST tools, we plan to integrate more scanners from custom and external sources. 

**Targeted Expansion Areas:**
- **Software Composition Analysis (SCA):** Tools like OSV-Scanner or Dependency-Track to deeply map transitive dependency vulnerabilities.
- **Dynamic Analysis (DAST) / API Security:** Incorporating active fuzzing tools (e.g., ZAP, Kiterunner) for live endpoint testing.
- **Mobile Security:** Frameworks like MobSF for Android/iOS target repositories.
- **Custom Source Scanners:** Proprietary or internal scripts and linters tailored to specific codebase architectures.

All new tools will follow the established pipeline: `Workflow Execution -> SARIF/JSON Output -> Python Normalizer -> Unified Dashboard State`.

## 2. Hybrid Artifact Storage (Cloudflare R2 + GitHub Artifacts) - Partially implemented
**The Problem:** Running 15+ parallel security scanners generates massive raw output files (e.g., SQLite databases, large SARIFs). Relying solely on `actions/upload-artifact` risks hitting the GitHub free-tier 500MB storage limit and bottlenecks execution during artifact packaging/downloading.

**Current implementation:**

- Producer artifacts bypass GitHub artifact ZIPs and upload to the R2 `temp-runs/`
  prefix.
- A one-day lifecycle rule removes temporary producer data.
- The Worker caps individual assets at 100 MB and current compressed report manifests
  at 900 MB.
- Durable current reports are served from R2. GitHub Releases remain only where the
  queue or compatibility path still requires them.

**Remaining hybrid work:**

- Remaining metadata-only GitHub artifact use may be retained where it is useful for
  execution summaries; large scanner outputs should continue using R2.
- **Cloudflare R2 as the Artifact Broker:** Workflows will bypass `actions/upload-artifact` for large files. Instead, they will use S3-compatible commands (`aws s3 cp`) to upload raw findings directly to a temporary Cloudflare R2 prefix (e.g., `s3://dashboard-bucket/temp-runs/<run_id>/`). 
- **GitHub Artifacts for Metadata:** GitHub Artifacts will be strictly reserved for lightweight metadata and execution summaries.
- **Cost & Retention Mitigation:** R2 provides a generous 10GB free tier. By applying a 1-day auto-delete lifecycle rule on the `temp-runs/` prefix, we eliminate the artifact bottleneck entirely without incurring storage costs. The final aggregated state (`unified-findings.json`) will remain permanently in Cloudflare KV/R2 to power the frontend UI indefinitely.


## 3. Triage & False Positive Suppression Engine (OWASP Alignment) - Planned
**The Problem:** Running 15+ scanners produces significant noise. Alert fatigue is the primary reason SAST deployments fail in enterprise environments (per OWASP guidelines).

**The Solution:**
We will implement a hybrid suppression engine to allow developers and security engineers to mute false positives:
- **Developer-Driven:** Support a .securityignore.yml configuration at the root of target repositories to ignore findings by path, rule, or hash.
- **Security-Driven:** Build a UI feature in the dashboard allowing security analysts to mark findings as "False Positive" or "Risk Accepted," suppressing them in all future runs.

## 4. Compliance and SLA Tracking - Planned
To enforce actionable security outcomes, we will track the remediation velocity of vulnerabilities.
- **Implementation:** Configure SLAs (e.g., Critical bugs must be fixed in 48 hours). 
- **Visibility:** Repositories violating SLAs will be flagged (color-coded red/amber) on the dashboard to immediately draw attention to non-compliant projects.

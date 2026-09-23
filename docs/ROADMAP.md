# Code Analysis Dashboard - Roadmap & Architectural Improvements

This document outlines planned improvements to scale the dashboard, increase security coverage, and mitigate CI/CD resource bottlenecks.

## 1. Scanner Expansion (Defense-in-Depth)
To further increase coverage beyond the currently integrated AI agents (Codex, Flounder, Alibaba OCR, VulnAgent) and standard SAST tools, we plan to integrate more scanners from custom and external sources. 

**Targeted Expansion Areas:**
- **Software Composition Analysis (SCA):** Tools like OSV-Scanner or Dependency-Track to deeply map transitive dependency vulnerabilities.
- **Dynamic Analysis (DAST) / API Security:** Incorporating active fuzzing tools (e.g., ZAP, Kiterunner) for live endpoint testing.
- **Mobile Security:** Frameworks like MobSF for Android/iOS target repositories.
- **Custom Source Scanners:** Proprietary or internal scripts and linters tailored to specific codebase architectures.

All new tools will follow the established pipeline: `Workflow Execution -> SARIF/JSON Output -> Python Normalizer -> Unified Dashboard State`.

## 2. Hybrid Artifact Storage (Cloudflare R2 + GitHub Artifacts)
**The Problem:** Running 15+ parallel security scanners generates massive raw output files (e.g., SQLite databases, large SARIFs). Relying solely on `actions/upload-artifact` risks hitting the GitHub free-tier 500MB storage limit and bottlenecks execution during artifact packaging/downloading.

**The Hybrid Solution:** 
We will pivot to a hybrid model involving GitHub Artifacts and Cloudflare R2:
- **Cloudflare R2 as the Artifact Broker:** Workflows will bypass `actions/upload-artifact` for large files. Instead, they will use S3-compatible commands (`aws s3 cp`) to upload raw findings directly to a temporary Cloudflare R2 prefix (e.g., `s3://dashboard-bucket/temp-runs/<run_id>/`). 
- **GitHub Artifacts for Metadata:** GitHub Artifacts will be strictly reserved for lightweight metadata and execution summaries.
- **Cost & Retention Mitigation:** R2 provides a generous 10GB free tier. By applying a 1-day auto-delete lifecycle rule on the `temp-runs/` prefix, we eliminate the artifact bottleneck entirely without incurring storage costs. The final aggregated state (`unified-findings.json`) will remain permanently in Cloudflare KV/R2 to power the frontend UI indefinitely.

## 3. Automated SaaS-Style Integration (Frictionless Onboarding)
**The Vision:** Evolve the software from a static repository dashboard into a generalized, automated Code Analysis platform capable of analyzing any repository or branch with zero manual configuration.

**Proposed User Flow:**
1. **Seamless Sign-in:** Users authenticate via GitHub OAuth.
2. **One-Click Authorization:** The user accepts permissions to install the GitHub App on their selected repositories (public or private).
3. **Automated Integration:** The software automatically detects the repository's stack, injects the necessary workflow hooks, and triggers the analysis pipeline.
4. **Immediate Results:** Analysis is executed in the background. Once finished, the dashboard dynamically generates a customized report for the newly onboarded repository and branch.

This architecture will allow any developer to "bring their own repo," instantly leveraging our entire suite of AI agents and deterministic SAST scanners without needing to manually copy workflow files or configure secrets.

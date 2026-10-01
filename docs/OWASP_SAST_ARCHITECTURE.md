# OWASP Source Code Analysis (SAST) Architecture

This document defines the enterprise architecture for the Code Analysis Dashboard, specifically designed to align with the **OWASP Source Code Analysis** methodology. It serves as the blueprint for integrating security seamlessly into the client's Software Development Life Cycle (SDLC).

## 1. Architectural Philosophy

According to OWASP, SAST is most effective when it is automated, comprehensive, and tuned to reduce alert fatigue. Our architecture implements this through a decoupled, asynchronous pipeline that aggregates results from 15+ specialized scanners (deterministic and AI-driven) into a unified, actionable dashboard.

## 2. SDLC Integration ("Shift-Left")

To maximize developer velocity while ensuring security, the pipeline operates in two modes:

*   **Auditing Mode (Passive):** By default, the CI pipeline runs asynchronously on push. It does not block the developer's build. Findings are aggregated and pushed to the dashboard for the security team to review.
*   **Enforcement Mode (Blocking):** Configurable via `service.json` (`"fail_build_on": "CRITICAL"`). The orchestrator will return a non-zero exit code, blocking the Pull Request from being merged if violations exceed the configured threshold.

## 3. False Positive Mitigation & Triage Engine

SAST tools inherently produce false positives. OWASP emphasizes the need for an efficient triage mechanism so developers do not suffer from alert fatigue.

We are designing a **Hybrid Triage System**:
1.  **Developer-Driven (Local):** Developers can place a `.securityignore.yml` file in the root of their repository. The orchestrator's `normalizer.py` will read this file and drop matching finding hashes before they ever reach the dashboard.
2.  **Security-Driven (Global UI):** Security analysts can mark findings as "False Positive" or "Risk Accepted" directly within the dashboard UI. These states are saved to the backend database and automatically applied to future pipeline runs to suppress recurring noise.

## 4. Software Composition Analysis (SCA)

Analyzing custom code is only half the battle. OWASP highlights the critical risk of vulnerable dependencies. 
*   **Implementation:** The pipeline includes dedicated SCA channels (`snyk`, `osv`, `trivy`) that resolve dependency graphs for Python (`requirements.txt`), Node.js (`package-lock.json`), and others.
*   **Dashboard View:** The dashboard will feature a unified "Supply Chain" view, rendering the transitive dependency graph and highlighting paths to vulnerable libraries.

## 5. Compliance and SLAs

To enforce security posture management, the dashboard will implement a Service Level Agreement (SLA) countdown engine:
*   **CRITICAL** vulnerabilities must be remediated or triaged within **48 hours**.
*   **HIGH** vulnerabilities within **14 days**.
*   Repositories violating these SLAs will be visually flagged in the dashboard (e.g., turning the project status RED) and will trigger automated alerts to project owners.

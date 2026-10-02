# OWASP Source Code Analysis (SAST) Architecture

This document defines the proposed enterprise architecture for the Code Analysis Dashboard, specifically designed to align with the **OWASP Source Code Analysis** methodology. It is a forward-looking blueprint; the deployed Kavach-focused service does not yet implement every capability described here.

## 1. Architectural Philosophy

According to OWASP, SAST is most effective when it is automated, comprehensive, and tuned to reduce alert fatigue. Our architecture implements this through a decoupled, asynchronous pipeline that aggregates results from 15+ specialized scanners (deterministic and AI-driven) into a unified, actionable dashboard.

## 2. SDLC Integration ("Shift-Left")

To maximize developer velocity while ensuring security, the pipeline operates in two modes:

*   **Auditing Mode (Passive, current focus):** User-triggered or configured workflows run asynchronously. Findings are aggregated for review and incomplete evidence remains explicit.
*   **Enforcement Mode (Planned):** A policy such as `fail_build_on: CRITICAL` would require an explicit workflow and branch-protection rollout. It is not a current promise of the Kavach observer path.

## 3. False Positive Mitigation & Triage Engine

SAST tools inherently produce false positives. OWASP emphasizes the need for an efficient triage mechanism so developers do not suffer from alert fatigue.

We are designing a **Hybrid Triage System** (planned):
1.  **Developer-Driven (Local):** Developers can place a `.securityignore.yml` file in the root of their repository. The orchestrator's `normalizer.py` will read this file and drop matching finding hashes before they ever reach the dashboard.
2.  **Security-Driven (Global UI):** Security analysts can mark findings as "False Positive" or "Risk Accepted" directly within the dashboard UI. These states are saved to the backend database and automatically applied to future pipeline runs to suppress recurring noise.

## 4. Software Composition Analysis (SCA)

Analyzing custom code is only half the battle. OWASP highlights the critical risk of vulnerable dependencies. 
*   **Implementation:** The pipeline includes dedicated SCA channels (`snyk`, `osv`, `trivy`) that resolve dependency graphs for Python (`requirements.txt`), Node.js (`package-lock.json`), and others.
*   **Dashboard View (planned):** A future unified "Supply Chain" view could render the transitive dependency graph and highlight paths to vulnerable libraries.

## 5. Compliance and SLAs

To enforce security posture management, the dashboard may implement a Service Level Agreement (SLA) countdown engine:
*   **CRITICAL** vulnerabilities must be remediated or triaged within **48 hours**.
*   **HIGH** vulnerabilities within **14 days**.
*   Repositories violating these SLAs will be visually flagged in the dashboard (e.g., turning the project status RED) and will trigger automated alerts to project owners.

# Tests

Repository validation is separated by runtime boundary.

| Suite | Location/command |
|---|---|
| Python service and policy tests | `python -m unittest scripts.code_analysis.test_hosted scripts.code_analysis.test_extensions scripts.code_analysis.test_portability scripts.code_analysis.test_scanner_access scripts.code_analysis.test_scanner_updates scripts.code_analysis.test_projects scripts.code_analysis.test_repository_service scripts.code_analysis.test_tooling_promotion` |
| Workflow policy audit | `python -m scripts.code_analysis.audit_workflows` |
| Worker tests | `node --test analysis-launcher/*.test.mjs` |
| UI build | `cd analysis-ui && npm run build` |
| UI browser tests | `cd analysis-ui && npm test` |
| Security canary fixtures | `tests/security_canary/` |

Tests must preserve read-only source boundaries, exact provenance, credential
separation, bounded storage, and truthful incomplete evidence.

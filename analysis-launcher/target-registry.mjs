export const EXECUTION_REPOSITORY = 'combustrrr/code-analysis-dashboard';
export const EXECUTION_REPOSITORY_ID = 1360051890;
export const CONFIGURED_TARGETS = [
  { id: '1267340546', repository_id: 1267340546, repository: 'ARYDESTROYER/Kavach-AgenticSOC', relationship: 'observer', branch: 'Testing', native_feedback: false },
  { id: '1278177697', repository_id: 1278177697, repository: 'combustrrr/Agentic-Kibana', relationship: 'observer', branch: 'Testing', native_feedback: false },
  { id: '1360051890', repository_id: 1360051890, repository: EXECUTION_REPOSITORY, relationship: 'connected', branch: 'main', native_feedback: false },
];
export const SUPPORTED_SCANNERS = ['atheris','bandit','checkov','codeql','coderabbit-ai-advisory','coverage','eslint','github-actions-security','github-secret-protection-posture','gitleaks','hadolint','openssf-scorecard','osv','pyright','radon','ruff','sbom-license-provenance','schemathesis','semgrep','shipping-image-cves','snyk','sonarqube-cloud','trivy','typescript','vulture','xenon'];
export const VENDOR_SCANNERS = new Set(['coderabbit-ai-advisory','github-secret-protection-posture','snyk','sonarqube-cloud']);
export const UNAVAILABLE_SCANNERS = new Set(['github-secret-protection-posture','github-actions-security']);
export const SCANNER_GROUPS = [['eslint','typescript'],['github-secret-protection-posture','github-actions-security'],['radon','xenon'],['shipping-image-cves','sbom-license-provenance']];

export function validateTargetRegistry(configuration, repository) {
  if (repository.id !== EXECUTION_REPOSITORY_ID || repository.full_name?.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase() ||
      configuration.execution_repository?.id !== EXECUTION_REPOSITORY_ID || configuration.execution_repository?.full_name?.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase() ||
      !Array.isArray(configuration.projects) || configuration.projects.length !== CONFIGURED_TARGETS.length) return false;

  return CONFIGURED_TARGETS.every(expected => {
    const project = configuration.projects.find(value => String(value.id) === expected.id);
    return project?.source_repository?.id === expected.repository_id &&
      project.source_repository.full_name?.toLowerCase() === expected.repository.toLowerCase() &&
      project.relationship === expected.relationship &&
      project.preferred_branch === expected.branch &&
      project.native_feedback_enabled === expected.native_feedback;
  });
}

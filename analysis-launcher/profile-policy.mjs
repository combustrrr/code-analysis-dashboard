// Pure repository-profile policy. Keep discovery and validation independent from routing.
export function validatePortableProfile(profile) {
  const path = p => typeof p === 'string' && p.length > 0 && !p.includes('\\') && !p.includes(':') && !p.startsWith('/') && !p.split('/').includes('..');
  const frontendFields=['javascript_install_command','javascript_test_command','frontend_build_command','frontend_preview_command','frontend_preview_url','frontend_lighthouse_budgets'];
  if (!profile || profile.mode !== 'portable' || Object.keys(profile).some(k => !['mode', 'python_root', 'javascript_root', 'commands', ...frontendFields].includes(k))) throw new Error('Use a portable profile with reviewed paths and command adapters.');
  for (const key of ['python_root', 'javascript_root']) if (key in profile && !path(profile[key])) throw new Error('Profile paths must stay inside the repository.');
  const commands = profile.commands || {};
  if (typeof commands !== 'object' || Array.isArray(commands)) throw new Error('Commands must be an object.');
  for (const [channel, command] of Object.entries(commands)) {
    if (!['eslint', 'typescript', 'coverage', 'atheris', 'schemathesis', 'pyright'].includes(channel) || !command || Object.keys(command).some(k => !['argv', 'cwd', 'install', 'output'].includes(k)) || !path(command.cwd || '.') || ('output' in command && !path(command.output))) throw new Error('Invalid command adapter or source path.');
    if (command.install && !Array.isArray(command.install)) throw new Error('Installation commands must be argument arrays.');
    for (const argv of [command.argv, ...(command.install || [])]) if (!Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(x => typeof x !== 'string' || !x || x.length > 4096 || x.includes('\0'))) throw new Error('Commands must be bounded argument arrays.');
  }
  const present=frontendFields.filter(key=>key in profile);
  if(present.length&&present.length!==frontendFields.length)throw new Error('Portable frontend scanning requires the complete reviewed profile.');
  for(const key of ['javascript_install_command','javascript_test_command','frontend_build_command','frontend_preview_command'])if(key in profile&&(!Array.isArray(profile[key])||!profile[key].length||profile[key].length>16||profile[key].some(value=>typeof value!=='string'||!value||value.includes('\0'))))throw new Error('Invalid frontend command.');
  if('frontend_preview_url' in profile&&!/^http:\/\/127\.0\.0\.1:\d{2,5}\/$/.test(profile.frontend_preview_url))throw new Error('Invalid frontend preview URL.');
  if('frontend_lighthouse_budgets' in profile){const budgets=profile.frontend_lighthouse_budgets,keys=['performance','accessibility','lcp_ms','cls'];if(!budgets||Object.keys(budgets).sort().join(',')!==[...keys].sort().join(',')||keys.some(key=>typeof budgets[key]!=='number'||budgets[key]<0))throw new Error('Invalid frontend Lighthouse budgets.');}
}

export function detectedProfile(paths) {
  const manifests = paths.filter(p => /(^|\/)(package.json|pyproject.toml|requirements[^/]*\.txt|Cargo.toml|go.mod|pom.xml|build.gradle)$/.test(p));
  const languageRoots = extension => {
    const roots = new Set(['.']);
    for (const path of paths) {
      if (!extension.test(path)) continue;
      const parts = path.split('/');
      parts.pop();
      for (let index = 1; index <= parts.length && roots.size < 100; index++) {
        roots.add(parts.slice(0, index).join('/'));
      }
      if (roots.size === 100) break;
    }
    return [...roots].sort((a, b) => a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b));
  };
  const profile = {mode: 'portable'};
  if (paths.some(p => p.endsWith('.py'))) profile.python_root = '.';
  if (paths.some(p => /\.[cm]?[jt]sx?$/.test(p))) profile.javascript_root = '.';
  return {
    profile,
    detected_manifests: manifests,
    dockerfiles: paths.filter(p => /(^|\/)Dockerfile(?:\.[^/]*)?$/.test(p)),
    language_roots: {
      python: languageRoots(/\.py$/),
      javascript: languageRoots(/\.[cm]?[jt]sx?$/),
    },
    notice: 'Portable scanners can run immediately. Language build, test, fuzzing and vendor adapters require reviewed repository configuration.',
  };
}

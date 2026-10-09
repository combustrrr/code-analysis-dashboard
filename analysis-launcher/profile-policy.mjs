// Pure repository-profile policy. Keep discovery and validation independent from routing.
export function validatePortableProfile(profile) {
  const path = p => typeof p === 'string' && p.length > 0 && !p.includes('\\') && !p.includes(':') && !p.startsWith('/') && !p.split('/').includes('..');
  if (!profile || profile.mode !== 'portable' || Object.keys(profile).some(k => !['mode', 'python_root', 'javascript_root', 'commands'].includes(k))) throw new Error('Use a portable profile with reviewed paths and command adapters.');
  for (const key of ['python_root', 'javascript_root']) if (key in profile && !path(profile[key])) throw new Error('Profile paths must stay inside the repository.');
  const commands = profile.commands || {};
  if (typeof commands !== 'object' || Array.isArray(commands)) throw new Error('Commands must be an object.');
  for (const [channel, command] of Object.entries(commands)) {
    if (!['eslint', 'typescript', 'coverage', 'atheris', 'schemathesis', 'pyright'].includes(channel) || !command || Object.keys(command).some(k => !['argv', 'cwd', 'install', 'output'].includes(k)) || !path(command.cwd || '.') || ('output' in command && !path(command.output))) throw new Error('Invalid command adapter or source path.');
    if (command.install && !Array.isArray(command.install)) throw new Error('Installation commands must be argument arrays.');
    for (const argv of [command.argv, ...(command.install || [])]) if (!Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(x => typeof x !== 'string' || !x || x.length > 4096 || x.includes('\0'))) throw new Error('Commands must be bounded argument arrays.');
  }
}

export function detectedProfile(paths) {
  const manifests = paths.filter(p => /(^|\/)(package.json|pyproject.toml|requirements[^/]*\.txt|Cargo.toml|go.mod|pom.xml|build.gradle)$/.test(p));
  const profile = {mode: 'portable'};
  if (paths.some(p => p.endsWith('.py'))) profile.python_root = '.';
  if (paths.some(p => /\.[cm]?[jt]sx?$/.test(p))) profile.javascript_root = '.';
  return {profile, detected_manifests: manifests, dockerfiles: paths.filter(p => /(^|\/)Dockerfile(?:\.[^/]*)?$/.test(p)), notice: 'Portable scanners can run immediately. Language build, test, fuzzing and vendor adapters require reviewed repository configuration.'};
}

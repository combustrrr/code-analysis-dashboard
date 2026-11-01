import {spawnSync} from 'node:child_process';

const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/dashboard-access.spec.ts'],{
  cwd:process.cwd(),
  env:{...process.env,TEST_DASHBOARD_ACCESS:'1'},
  stdio:'inherit',
});
process.exit(result.status??1);

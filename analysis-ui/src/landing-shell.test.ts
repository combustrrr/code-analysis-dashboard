import {describe,expect,it} from 'vitest';
import {landingShell} from './landing-shell';

describe('landing shell',()=>{
 it('renders a compact fallback when no preview projects are configured',()=>{
  const html=landingShell([]);
  expect(html).toContain('No repositories available');
  expect(html).toContain('0 trusted repositories');
  expect(html).not.toContain('dossier-row');
 });
});

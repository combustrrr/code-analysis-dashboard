import { expect, test } from '@playwright/test';
import { safeGithubUrl } from '../src/safeUrls';

test.describe('safeGithubUrl', () => {
  test('accepts valid GitHub HTTPS URLs unchanged', () => {
    const urls = [
      'https://github.com/combustrrr/code-analysis-dashboard/blob/056eee4/README.md',
      'https://www.github.com/combustrrr/code-analysis-dashboard/actions/runs/34630716336',
      'https://GITHUB.COM/combustrrr/code-analysis-dashboard/issues?q=is%3Aopen#results',
    ];

    for (const url of urls) expect(safeGithubUrl(url)).toBe(url);
  });

  test('rejects unsafe schemes', () => {
    const urls = [
      'http://github.com/combustrrr/code-analysis-dashboard',
      'javascript:window.alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const url of urls) expect(safeGithubUrl(url)).toBeUndefined();
  });

  test('rejects credentials and ports', () => {
    const urls = [
      'https://user:token@github.com/combustrrr/code-analysis-dashboard',
      'https://github.com:8443/combustrrr/code-analysis-dashboard',
    ];

    for (const url of urls) expect(safeGithubUrl(url)).toBeUndefined();
  });

  test('rejects non-GitHub hosts', () => {
    const urls = [
      'https://gitlab.com/combustrrr/code-analysis-dashboard',
      'https://github.com.evil.example/combustrrr/code-analysis-dashboard',
      'https://example.com/?redirect=https%3A%2F%2Fgithub.com',
    ];

    for (const url of urls) expect(safeGithubUrl(url)).toBeUndefined();
  });
});

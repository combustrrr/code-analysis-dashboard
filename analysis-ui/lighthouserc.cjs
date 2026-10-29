module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx vite preview --host 127.0.0.1 --port 4178',
      startServerReadyPattern: 'Local:',
      url: ['http://127.0.0.1:4178/'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        chromeFlags: '--headless --no-sandbox --disable-gpu',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', {minScore: 0.95}],
        'categories:accessibility': ['error', {minScore: 1}],
        'largest-contentful-paint': ['error', {maxNumericValue: 1200, aggregationMethod: 'median'}],
        'cumulative-layout-shift': ['error', {maxNumericValue: 0, aggregationMethod: 'median'}],
      },
    },
    upload: {target: 'filesystem', outputDir: '.lighthouseci'},
  },
};

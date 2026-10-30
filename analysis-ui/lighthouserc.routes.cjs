const base='http://127.0.0.1:4178/';
const project='1278177697';
const issue='sid-v1:706ce7dc97f17d10de15c3514a542b5c37867b24072c3ad7567b119e696cc18a';

module.exports={
  ci:{
    collect:{
      startServerCommand:'npx vite preview --host 127.0.0.1 --port 4178',
      startServerReadyPattern:'Local:',
      url:[
        base,
        `${base}#/projects`,
        `${base}#/projects/${project}`,
        `${base}#/projects/${project}/issues`,
        `${base}#/projects/${project}/issues?issue=${encodeURIComponent(issue)}`,
        `${base}#/projects/${project}/coverage`,
        `${base}#/projects/${project}/report`,
        `${base}#/projects/${project}/run`,
        `${base}#/projects/${project}/progress?request=lhci-route-audit`,
        `${base}#/settings/overview`,
        `${base}#/settings/integrations?project=${project}`,
        `${base}#/settings/provenance?project=${project}`,
      ],
      numberOfRuns:3,
      settings:{
        preset:'desktop',
        chromeFlags:'--headless --no-sandbox --disable-gpu',
      },
    },
    upload:{target:'filesystem',outputDir:'.lighthouseci-routes'},
  },
};

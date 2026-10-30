const config=require('./lighthouserc.routes.cjs');

delete config.ci.collect.settings.preset;
config.ci.collect.settings={
  ...config.ci.collect.settings,
  formFactor:'mobile',
  screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:2,disabled:false},
  chromeFlags:'--headless --no-sandbox --disable-gpu',
};
config.ci.upload.outputDir='.lighthouseci-routes-mobile';

module.exports=config;

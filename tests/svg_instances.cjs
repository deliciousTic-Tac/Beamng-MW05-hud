'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..'), gameUi=process.env.BEAMNG_UI_PATH;
assert(gameUi,'Set BEAMNG_UI_PATH to the ui directory of your BeamNG.drive installation.');
const names=['MW05VehicleHUD','MW05ForcedInduction','MW05OilPressure','MW05OilTemperature','MW05BatteryVoltage','MW05Ignition'];
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1120,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://mw05.test/ui/**',route=>{
   const url=decodeURIComponent(new URL(route.request().url()).pathname);
   const file=path.join(url.startsWith('/ui/modules/apps/MW05')?root:gameUi,url.startsWith('/ui/modules/apps/MW05')?url.slice(1):url.slice(4));
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type={'.css':'text/css','.svg':'image/svg+xml','.otf':'font/otf'}[path.extname(file)];
   return route.fulfill({contentType:type||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const hosts=names.flatMap(name=>[0,1].map(index=>{
   const meta=JSON.parse(fs.readFileSync(path.join(root,'ui/modules/apps',name,'app.json'),'utf8'));
   return `<div class="stage" ng-controller="AppHost" data-app="${name}" data-copy="${index}">${meta.domElement}</div>`;
  })).join('');
  await page.setContent(`<base href="http://mw05.test/"><style>body{margin:0;padding:20px;background:#24272a;display:grid;grid-template-columns:repeat(4,260px);gap:10px}.stage{width:260px;height:260px}</style>${hosts}`);
  await page.addScriptTag({path:path.join(gameUi,'lib/ext/angular/angular.js')});
  await page.addScriptTag({content:'window.StreamsManager={add(){},remove(){}};window.bngApi={activeObjectLua(){},engineLua(){}};angular.module("beamng.apps",[]).controller("AppHost",function(){});'});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'lib/runtime.js'),'utf8')});
  for(const name of names)await page.addScriptTag({content:fs.readFileSync(path.join(root,'ui/modules/apps',name,'app.js'),'utf8')});
  await page.evaluate(()=>{
   angular.bootstrap(document.body,['beamng.apps']);
   const scope=angular.element(document.body).injector().get('$rootScope');
   scope.$broadcast('streamsUpdate',{electrics:{wheelspeed:20,rpmTacho:3000,gear:'3',fuel:.6,watertemp:90,boost:12,boostMax:36,oilPressure:4.2,batteryVoltage:14.2,ignitionLevel:2,engineRunning:1},engineInfo:[800,7000,6200,0,3000],engineThermalData:{oilTemperature:105}});
   scope.$digest();
  });
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(150);
  async function inspect(){return page.evaluate(()=>{
   const ids=[...document.querySelectorAll('svg defs [id]')].map(el=>el.id),issues=[];
   for(const stage of document.querySelectorAll('.stage')){
    for(const el of stage.querySelectorAll('.mw05-needle path,.mw05-oil-needle path,.mw05-boost-needle path,.mw05-ignition-inner,.mw05-hud-face')){
     const style=getComputedStyle(el);
     const reference=el.matches('.mw05-ignition-inner,.mw05-hud-face')?style.fill:style.filter;
     const id=/#([^"\)]+)/.exec(reference)?.[1];
     if(!id||!document.getElementById(id)||!stage.contains(document.getElementById(id)))issues.push({app:stage.dataset.app,reference});
    }
   }
   return {count:ids.length,unique:new Set(ids).size,issues};
  });}
  let result=await inspect();assert.equal(result.count,26);assert.equal(result.unique,result.count);assert.deepEqual(result.issues,[]);
  assert.deepEqual(errors,[]);
  if(process.env.MW05_SVG_SCREENSHOT)await page.screenshot({path:process.env.MW05_SVG_SCREENSHOT});
  await page.evaluate(()=>document.querySelectorAll('.stage[data-copy="0"]').forEach(stage=>{angular.element(stage).scope().$destroy();stage.remove();}));
  result=await inspect();assert.equal(result.count,13);assert.equal(result.unique,13);assert.deepEqual(result.issues,[]);
  console.log('PASS SVG: 12 instances; unique filters/gradients; computed references stay in their own app; removing neighbours preserves remaining effects.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

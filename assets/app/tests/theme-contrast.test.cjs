const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname,'../theme-switcher.css'),'utf8');
const palettes = ['rainforest','coast','terracotta','ink','burgundy','midnight'];
function luminance(hex) {
 const rgb = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return rgb.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const l=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(l[1]+.05)/(l[0]+.05);}
for(const id of palettes) test(`${id}: text, secondary copy, actions and gold remain readable`,()=>{
 const tokens={};
 for(const block of css.matchAll(new RegExp('body\\[data-handbook-theme="'+id+'"\\]\\{([^}]+)\\}','g'))){
  for(const [,k,v] of block[1].matchAll(/(--hb-[\w-]+):\s*(#[0-9a-f]{6})/gi))tokens[k]=v;
 }
 const pairs=[['--hb-on-light','--hb-page'],['--hb-on-light-muted','--hb-page'],['--hb-on-dark','--hb-deep'],['--hb-on-dark-muted','--hb-deep'],['--hb-on-dark','--hb-action'],['--hb-on-dark','--hb-surface'],['--hb-deep','--hb-accent']];
 for(const [fg,bg] of pairs){assert.ok(tokens[fg]&&tokens[bg],`missing ${fg}/${bg}`);assert.ok(contrast(tokens[fg],tokens[bg])>=4.5,`${fg}/${bg} below 4.5:1`);}
 assert.ok(contrast('#88632c',tokens['--hb-page'])>=4.5,'small gold text on paper');
});

const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const startupTheme = html.match(/<script id="travel-startup-theme">([\s\S]*?)<\/script>/)[1];
for(const id of palettes) test(`${id}: first cover paint restores the cached palette`,()=>{
 const style={},dataset={};
 vm.runInNewContext(startupTheme,{localStorage:{getItem:()=>id},location:{pathname:'/'},document:{documentElement:{dataset,style:{setProperty:(k,v)=>{style[k]=v;}}}}});
 assert.equal(dataset.startupTheme,id);assert.match(style['--startup-deep'],/^#[0-9a-f]{6}$/);assert.ok(contrast(style['--startup-ink'],style['--startup-deep'])>=4.5);
});
test('unavailable or invalid visual cache keeps a readable default and does not touch trip storage',()=>{
 for(const getItem of [()=>{throw Error('storage disabled')},()=>'<script>',()=>null,()=>'constructor']){
  const style={},dataset={};
  vm.runInNewContext(startupTheme,{localStorage:{getItem},location:{pathname:'/'},document:{documentElement:{dataset,style:{setProperty:(k,v)=>{style[k]=v;}}}}});
  assert.equal(dataset.startupTheme,'rainforest');assert.equal(style['--startup-deep'],'#082f29');
 }
});

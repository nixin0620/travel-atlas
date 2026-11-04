const test = require('node:test');
const assert = require('node:assert/strict');
const {activeChapter,targetTop} = require('../chapter-navigation.js');

test('scroll highlight follows on-page order even when nav entries were inserted later', () => {
  assert.equal(activeChapter([{id:'daily',top:600},{id:'route',top:-700},{id:'footprints',top:-2000}],140),'route');
  assert.equal(activeChapter([{id:'daily',top:120},{id:'route',top:-1180},{id:'footprints',top:-2500}],140),'daily');
});
test('hidden legacy sections cannot win the chapter highlight', () => {
  assert.equal(activeChapter([{id:'route',top:-1000},{id:'hidden',top:80,visible:false},{id:'daily',top:500}],140),'route');
  assert.equal(activeChapter([],140),null);
});
test('a short viewport keeps the previous section until the next header crosses the marker', () => {
  assert.equal(activeChapter([{id:'daily',top:-200},{id:'guide',top:100}],80),'daily');
});
test('heading destinations account for the viewport offset and document limits', () => {
  assert.equal(targetTop(430,1000,20,8000),1410);
  assert.equal(targetTop(5,0,20,8000),0);
  assert.equal(targetTop(1000,7500,20,8000),8000);
});

test('cover has its own active state until the atlas heading enters the reading area',()=>{
 assert.equal(activeChapter([{id:'top',top:0},{id:'china-footprints',top:619}],140),'top');
 assert.equal(activeChapter([{id:'top',top:-500},{id:'china-footprints',top:119}],140),'china-footprints');
});

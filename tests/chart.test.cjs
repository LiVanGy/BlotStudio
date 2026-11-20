'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('../src/core.js');
require('../src/science.js');
require('../src/ui.js');
const B=globalThis.BS;
const group=(name,values)=>({name,values,...B.summary(values)});
const data={groups:[group('Control',[1,1,1,10]),group('Treatment',[3])]};
const settings={mode:'bars',error:'sd',title:'',axisLabel:''};

test('SD, SEM and no-error figures retain each sample and keep the full uncertainty range inside the plot',()=>{
  const charts=['sd','sem','none'].map(error=>B.chartSVG(data,'SYNTHETIC',false,{...settings,error}));
  for(const svg of charts)assert.equal((svg.match(/<circle /g)||[]).length,5);
  const verticalErrors=svg=>Array.from(svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="#273c45" stroke-width="1.4"\/>/g))
    .filter(match=>match[1]===match[3]&&Number(match[1])>86);
  const [sd,sem,none]=charts.map(verticalErrors);
  assert.equal(sd.length,1);
  assert.equal(sem.length,1);
  assert.equal(none.length,0);
  for(const [index,[line]] of [sd,sem].entries()){
    const axis=charts[index].match(/<line x1="86" y1="54" x2="86" y2="([^"]+)"/);
    assert.ok(Number(line[2])>=54);
    assert.ok(Number(line[4])<=Number(axis[1]));
  }
  assert.notEqual(sd[0][0],sem[0][0]);
  assert.match(charts[0],/Error bars = SD/);
  assert.match(charts[1],/Error bars = SEM/);
  assert.doesNotMatch(charts[2],/Error bars =/);
});

test('point summaries and signed bar geometry represent negative samples and keep original values',()=>{
  const signed={groups:[group('A',[-1,-2,-3]),group('B',[2,4])]};
  const before=JSON.stringify(signed);
  const bars=B.chartSVG(signed,'Protein',false,settings);
  assert.ok([...bars.matchAll(/<rect [^>]*height="([^"]+)"/g)].every(match=>Number(match[1])>=0));
  const points=B.chartSVG(signed,'Protein',false,{...settings,mode:'points',title:'A < B',axisLabel:'X & Y'});
  assert.equal((points.match(/<rect /g)||[]).length,1);
  assert.equal((points.match(/<circle /g)||[]).length,5);
  assert.equal((points.match(/stroke-width="2.2"/g)||[]).length,2);
  assert.match(points,/A &lt; B/);
  assert.match(points,/X &amp; Y/);
  assert.equal(JSON.stringify(signed),before);
});

test('dense charts enlarge their viewport, distinguish tiny values and emit one mark per included observation',()=>{
  const many={groups:Array.from({length:18},(_,i)=>group('剂量组 '+i,[1e-8,2e-8]))};
  const svg=B.chartSVG(many,'Synthetic',false,{...settings,error:'none'});
  assert.ok(Number(svg.match(/viewBox="0 0 (\d+)/)[1])>760);
  assert.match(svg,/e-8/);
  assert.equal((svg.match(/<circle /g)||[]).length,36);
  assert.match(B.chartSVG(data,'tiny',false,settings,'controlRatio'),/Target \/ loading control/);
  assert.match(B.chartSVG({...data,rows:[{method:'profile'}]},'tiny',false,settings,'corrected'),/Peak area/);
});

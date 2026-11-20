'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
for(const file of ['core','analysis-engine','science'])require('../src/'+file+'.js');
const B=globalThis.BS;

test('the downloadable native 16-bit WB project reproduces its three TIFFs and every NumPy CSV row',()=>{
  const directory=process.env.BLOTSTUDIO_EXAMPLE_DIR||path.join(__dirname,'../examples');
  const project=B.validate(JSON.parse(fs.readFileSync(path.join(directory,'SYNTHETIC-WB-workflow.wbproj'),'utf8')));
  const group=project.groups[0];
  assert.equal(project.sources.length,3);
  for(const source of project.sources){
    const original=fs.readFileSync(path.join(directory,source.originalName));
    assert.ok(source.original.startsWith('data:image/tiff;base64,'));
    assert.deepEqual(Buffer.from(source.original.split(',')[1],'base64'),original);
  }

  const python=process.env.BLOTSTUDIO_PYTHON||'python3';
  const csv=path.join(directory,'expected-independent-numpy.csv');
  const readCsv='import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding="utf-8-sig",newline="")))))';
  const expected=JSON.parse(execFileSync(python,['-c',readCsv,csv],{encoding:'utf8'}));
  const records=B.records(project,group);
  assert.equal(expected.length,36);
  assert.equal(records.length,36);
  const key=(protein,sample)=>JSON.stringify([protein,sample]);
  const measured=new Map(records.map(r=>[key(r.protein,r.sampleId),r]));
  assert.equal(measured.size,records.length);
  const normalized=new Map();
  for(const protein of ['p-Akt','Akt']){
    const stats=B.statData(records,protein,'ratio','Control',true);
    assert.equal(stats.rows.length,12);
    for(const row of stats.rows)normalized.set(key(protein,row.sampleId),row.value);
  }
  const seen=new Set();
  for(const row of expected){
    const id=key(row.protein,row.sampleId),record=measured.get(id);
    assert.ok(record,id);
    assert.ok(!seen.has(id),'Duplicate NumPy row '+id);
    seen.add(id);
    assert.equal(record.analysisBitDepth,16);
    assert.equal(record.method,'rect');
    assert.equal(record.analysisSettings.convert8,false);
    assert.equal(record.analysisSettings.background,'roi');
    assert.equal(record.analysisSettings.presmooth,false);
    assert.equal(record.analysisSettings.rotation,0);
    assert.equal(record.group,row.group);
    for(const field of ['area','mean','raw','backgroundMean','corrected']){
      assert.equal(record[field],Number(row[field]),id+' '+field);
    }
    if(row.ratio){
      assert.ok(Math.abs(record.ratio-Number(row.ratio))<1e-12,id+' ratio');
      assert.ok(Math.abs(normalized.get(id)-Number(row.fold))<1e-12,id+' normalized ratio');
    }else{
      assert.equal(record.ratio,null,id+' without reference');
      assert.equal(row.fold,'');
    }
  }
});

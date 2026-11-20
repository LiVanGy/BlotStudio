const test=require('node:test');
const assert=require('node:assert/strict');
for(const file of ['core','scene','workflow'])require('../src/'+file+'.js');
const B=globalThis.BS;
for(const extended of [false,true]){
  test('Quick layout keeps existing manual marks on the page, extended='+extended,()=>{
    const group=B.blankGroup();
    group.canvas={width:2300,height:1600,background:'#ffffff'};
    group.samples=[{id:'S1',group:'Control'}];
    const image=B.object('image',{crop:{x:0,y:0,w:300,h:20},w:1400,h:90});
    const note=B.object('text',{x:2000,y:1450,w:250,h:45,text:'note'});
    group.objects=[image,note];
    B.quickLayout(group,{extended,width:400,cropMode:'free'});
    assert.ok(group.canvas.width>=note.x+note.w);
    assert.ok(group.canvas.height>=note.y+note.h);
    for(const o of group.objects.filter(o=>o.autoLabel||o.type==='image')){
      assert.ok(group.canvas.width>=o.x+o.w);
      assert.ok(group.canvas.height>=o.y+o.h);
    }
  });
}

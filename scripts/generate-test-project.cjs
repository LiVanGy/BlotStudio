// Ephemeral synthetic fixture, used by the complete test suite. Never packaged.
const fs=require('node:fs'),path=require('node:path');
for(const name of ['core','science','scene'])require('../src/'+name+'.js');
const B=globalThis.BS,directory=process.env.BLOTSTUDIO_EXAMPLE_DIR;
if(!directory)throw Error('BLOTSTUDIO_EXAMPLE_DIR must name a temporary test directory');
const fixture=JSON.parse(fs.readFileSync(path.join(directory,'workflow-fixture.json'),'utf8'));
const project=B.blankProject(),group=project.groups[0];project.name='SYNTHETIC verification';project.demo=true;group.demo=true;group.name='SYNTHETIC workflow';
group.samples=Array.from({length:12},(_,i)=>({id:'SYN-'+(i+1),group:['Control','Low','Medium','High'][Math.floor(i/3)],replicate:i%3+1,include:true}));
project.sources=fixture.sources;
group.objects=fixture.sources.map((source,i)=>{const image=B.imageObject(source,i);image.protein=['p-Akt','Akt','β-Actin'][i];image.rois=fixture.rois.map(roi=>({...roi,id:B.uid()}));image.background={...fixture.background};image.mw=i===2?'42':'60';return image;});
group.objects[0].referenceId=group.objects[1].id;group.objects[1].referenceId=group.objects[2].id;
B.quickLayout(group);B.log(project,'Created synthetic verification fixture','Not experimental data');B.validate(project);
fs.writeFileSync(path.join(directory,'SYNTHETIC-WB-workflow.wbproj'),JSON.stringify(project));

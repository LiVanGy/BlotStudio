"""Generate reproducible, explicitly synthetic Western blot workflow fixtures (not research results)."""
from pathlib import Path
import base64,hashlib,json,csv,io
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]/'examples'
root.mkdir(exist_ok=True)
rng=np.random.default_rng(20261015)
w,h=720,96
Y,X=np.mgrid[:h,:w]
roi=[dict(x=9+60*i,y=32,w=42,h=32,sampleIndex=i) for i in range(12)]
bg=dict(x=0,y=0,w=720,h=12)
assets=[];expected=[]
for k,name in enumerate(['p-Akt','Akt','β-Actin']):
    strength=np.repeat([9000,16000,23000,30000],3) if k==0 else np.full(12,27000 if k==1 else 30000)
    a=60000+rng.normal(0,100,(h,w))
    for lane in range(12):
        a-=strength[lane]*np.exp(-.5*(((X-(30+60*lane))/18)**6+((Y-48)/6)**2))
    pixels=np.rint(a).clip(0,65535).astype('<u2')
    tif=root/(name+'-SYNTHETIC-16bit.tif');Image.fromarray(pixels).save(tif,compression='tiff_lzw')
    preview=np.rint(pixels.astype(float)*255/65535).astype('uint8')
    png=root/(name+'-SYNTHETIC-preview.png');Image.fromarray(preview).save(png)
    orig=tif.read_bytes();previewBytes=png.read_bytes()
    assets.append(dict(id='synthetic-source-'+str(k),name=tif.name,width=w,height=h,bitDepth=16,pixels=base64.b64encode(pixels.tobytes()).decode(),url='data:image/png;base64,'+base64.b64encode(previewBytes).decode(),original='data:image/tiff;base64,'+base64.b64encode(orig).decode(),originalName=tif.name,originalSize=len(orig),hash='sha256:'+hashlib.sha256(orig).hexdigest(),demo=True))
    backgroundMean=float(pixels[:12].mean())
    for i,r in enumerate(roi):
        values=pixels[r['y']:r['y']+r['h'],r['x']:r['x']+r['w']]
        area=int(values.size);total=int(values.astype('uint64').sum())
        expected.append(dict(protein=name,sampleId='SYN-'+str(i+1),group=['Control','Low','Medium','High'][i//3],area=area,mean=float(values.mean()),raw=65535*area-total,backgroundMean=backgroundMean,corrected=backgroundMean*area-total,roi=r))
for r in expected:
    ref='Akt' if r['protein']=='p-Akt' else 'β-Actin' if r['protein']=='Akt' else None
    r['ratio']=r['corrected']/next(v['corrected'] for v in expected if v['protein']==ref and v['sampleId']==r['sampleId']) if ref else None
for protein in ['p-Akt','Akt']:
    values=[r for r in expected if r['protein']==protein];control=np.mean([r['ratio'] for r in values if r['group']=='Control'])
    for r in values:r['fold']=r['ratio']/float(control)
(root/'workflow-fixture.json').write_text(json.dumps(dict(notice='SYNTHETIC TEST DATA ONLY — NOT EXPERIMENTAL RESULTS',sources=assets,rois=roi,background=bg,expected=expected),ensure_ascii=False),encoding='utf-8')
with (root/'expected-independent-numpy.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['protein','sampleId','group','area','mean','raw','backgroundMean','corrected','ratio','fold'];out=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');out.writeheader();out.writerows(expected)
print('Generated 3 explicitly synthetic 16-bit WB strips and independent NumPy reference (36 ROIs).')

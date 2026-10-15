"""Regenerate deterministic, explicitly simulated fixtures with Pillow + SciPy.

No biological/experimental images are read. Run from any directory. TIFF pixels
and statistical references are independently calculated in Python.
"""
from pathlib import Path
import base64
import json
import numpy as np
from PIL import Image
from scipy import stats

out = Path(__file__).parent / 'fixtures' / 'audit'
out.mkdir(parents=True, exist_ok=True)
a = ((np.arange(251 * 67, dtype=np.uint32) * 7919 + 17) % 65536).astype(np.uint16).reshape(67, 251)
for order in ['little', 'big']:
    for compression in ['raw', 'packbits', 'tiff_lzw', 'tiff_adobe_deflate']:
        for predictor in ([1, 2] if compression in ['tiff_lzw', 'tiff_adobe_deflate'] else [1]):
            image = Image.fromarray(a.astype('>u2') if order == 'big' else a)
            image.save(out / f'native-{order}-{compression}-p{predictor}.tif', compression=compression, tiffinfo={317: predictor, 278: 13})
for depth in [8, 16]:
    arr = (a % 256).astype(np.uint8) if depth == 8 else a
    Image.fromarray(arr).save(out / f'white-zero-{depth}.tif', compression='tiff_lzw', tiffinfo={262: 0})
Image.fromarray(a).save(out / 'multipage.tif', save_all=True, append_images=[Image.fromarray(65535 - a), Image.fromarray(a // 2)], compression='tiff_lzw')
rgb = np.stack([(a % 256).astype(np.uint8), ((a // 3) % 256).astype(np.uint8), ((a // 7) % 256).astype(np.uint8)], 2)
Image.fromarray(rgb).save(out / 'rgb-predictor.tif', compression='tiff_adobe_deflate', tiffinfo={317: 2})

# A 12-lane simulated WB, dark bands on uniform high native 16-bit background.
# The ROIs are independent of the application's auto-ROI placement algorithm.
wb = np.full((48, 720), 60000, dtype=np.uint16)
roi_specs = []
for lane, signal in enumerate([3000, 3300, 3600, 6000, 6600, 7200, 9000, 9900, 10800, 15000, 16500, 18000]):
    x, y, w, h = lane * 60 + 15, 18, 30, 12
    wb[y:y + h, x:x + w] -= signal
    roi_specs.append({'x': x, 'y': y, 'w': w, 'h': h})
Image.fromarray(wb).save(out / 'simulated-wb16.tif', compression='tiff_adobe_deflate', tiffinfo={317: 2})
background = {'x': 0, 'y': 0, 'w': 720, 'h': 8}
wb_refs = []
for roi in roi_specs:
    x, y, w, h = [roi[k] for k in ['x', 'y', 'w', 'h']]
    region = wb[y:y + h, x:x + w].astype(np.float64)
    wb_refs.append({'roi': roi, 'area': region.size, 'mean': float(region.mean()), 'raw': float(65535 * region.size - region.sum()), 'backgroundMean': 60000., 'corrected': float(60000 * region.size - region.sum())})
(out / 'wb-reference.json').write_text(json.dumps({'simulated': True, 'background': background, 'measurements': wb_refs}), encoding='utf8')

checks = {}
for file in sorted(out.glob('*.tif')):
    image = Image.open(file)
    pages = []
    for page in range(image.n_frames):
        image.seek(page)
        raw = np.asarray(image)
        depth = 16 if str(image.mode).startswith('I;16') else 8
        if raw.ndim == 3:
            raw = np.floor(.299 * raw[:, :, 0] + .587 * raw[:, :, 1] + .114 * raw[:, :, 2] + .5).astype(np.uint8)
        elif image.tag_v2.get(262) == 0 and depth == 16:
            # Pillow returns stored samples for I;16 and display intensities for L.
            raw = 65535 - raw
        encoded = raw.astype('<u2' if depth == 16 else 'u1').tobytes()
        pages.append({'width': image.width, 'height': image.height, 'bitDepth': depth, 'samplesBase64': base64.b64encode(encoded).decode(), 'compression': image.tag_v2.get(259), 'predictor': image.tag_v2.get(317, 1), 'strips': len(image.tag_v2.get(273))})
    checks[file.name] = pages
(out / 'reference.json').write_text(json.dumps(checks), encoding='utf8')
rng = np.random.default_rng(6471)
cases = []
for na, nb, scale, shift in [(2, 3, 1, 0), (3, 10, .01, 0), (12, 17, 10000, 100000), (40, 12, 1, 0), (100, 91, 1, 0)]:
    aa, bb = rng.normal(shift, scale, na), rng.normal(shift + scale * .7, scale * 2, nb)
    result = stats.ttest_ind(aa, bb, equal_var=False)
    cases.append({'a': aa.tolist(), 'b': bb.tolist(), 't': float(result.statistic), 'p': float(result.pvalue), 'df': float(result.df)})
(out / 'stats-reference.json').write_text(json.dumps(cases), encoding='utf8')
print(f'Generated {len(checks)} simulated TIFF fixtures, 12 WB measurements and {len(cases)} SciPy references.')

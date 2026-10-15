const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
for (const file of ['core', 'science', 'tiff']) require('../src/' + file + '.js');
const B = globalThis.BS;
const fixtures = path.join(__dirname, 'fixtures', 'audit');
const read = name => fs.readFileSync(path.join(fixtures, name));
function source(values, depth = 8, width = values.length) {
  const bytes = new Uint8Array(values.length * depth / 8), view = new DataView(bytes.buffer);
  values.forEach((v, i) => depth === 16 ? view.setUint16(i * 2, v, true) : bytes[i] = v);
  return { id: B.uid(), name: 'SIMULATED audit fixture', width, height: values.length / width, bitDepth: depth, pixels: B.base64(bytes) };
}
function setup() {
  const s = source([80, 100, 150, 170, 220, 220]);
  const g = B.blankGroup();g.samples = g.samples.slice(0, 2);
  const target = B.imageObject(s), reference = B.imageObject(s);
  target.protein = 'target';reference.protein = 'reference';target.referenceId = reference.id;
  target.rois = [0, 1].map(i => ({ id: B.uid(), x: i, y: 0, w: 1, h: 1, sampleIndex: i }));
  reference.rois = [0, 1].map(i => ({ id: B.uid(), x: i + 2, y: 0, w: 1, h: 1, sampleIndex: i }));
  g.objects = [target, reference];return { s, g, target, reference, p: { sources: [s] } };
}
test('malformed, empty and entirely external ROIs fail before computing a number', () => {
  const s = source([1, 2, 3, 4], 8, 2);
  for (const roi of [null, { x: NaN, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }, { x: 0, y: 0, w: -1, h: 1 }, { x: 0, y: Infinity, w: 1, h: 1 }, { x: 2, y: 0, w: 1, h: 1 }]) assert.throws(() => B.measure(s, roi));
  assert.throws(() => B.measure(s, { x: 0, y: 0, w: 1, h: 1 }, null, 'invalid'));
  assert.throws(() => B.measure(s, { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }));
});
test('partly external fractional ROI exposes its effective original-pixel area', () => {
  const r = B.measure(source([10, 20, 30, 40], 8, 2), { x: -.2, y: .2, w: 1.4, h: 1 });
  assert.deepEqual(r.rect, { x: 0, y: 0, w: 2, h: 2 });assert.equal(r.area, 4);assert.equal(r.mean, 25);assert.equal(r.clipped, true);
});
test('pixel cache is invalidated if source bytes change and malformed native pixels are rejected', () => {
  const s = source([1, 2]);assert.equal(B.pixels(s)[0], 1);s.pixels = B.base64(Uint8Array.of(9, 10));assert.equal(B.pixels(s)[0], 9);
  s.pixels = B.base64(Uint8Array.of(9));assert.throws(() => B.pixels(s), /长度/);
  assert.throws(() => B.pixels({ ...s, bitDepth: 32 }), /位深/);
});
test('background overlap is disclosed without hiding the measured raw values', () => {
  const { p, g, target } = setup();target.background = { x: 0, y: 0, w: 3, h: 1 };
  const r = B.records(p, g).find(r => r.objectId === target.id);assert.match(r.issue, /重叠/);assert.equal(r.raw, 175);
});
test('clipped background, overlapping bands and saturated reference warnings remain visible', () => {
  const { p, g, target, reference, s } = setup();target.background = { x: -1, y: 0, w: 2, h: 1 };
  target.rois[1].x = 0;reference.rois[0].x = 4;s.pixels = B.base64(Uint8Array.from([80, 100, 150, 170, 0, 220]));
  const r = B.records(p, g).find(r => r.objectId === target.id);assert.match(r.issue, /背景框超出/);assert.match(r.issue, /条带 ROI 之间重叠/);
  target.background = null;const withRef = B.records(p, g).find(r => r.objectId === target.id);assert.match(withRef.issue, /参照：饱和/);assert.ok(withRef.ratio > 0);
});
test('self reference cannot fabricate unit ratios', () => {
  const { p, g, target } = setup();target.referenceId = target.id;
  const r = B.records(p, g).find(r => r.objectId === target.id);assert.equal(r.ratio, null);assert.match(r.issue, /自身/);
});
test('reference matching follows sample identity when ROI order differs', () => {
  const { p, g, target, reference } = setup();reference.rois.reverse();
  const r = B.records(p, g).filter(r => r.objectId === target.id);assert.equal(r[0].ratio, 175 / 105);assert.equal(r[1].ratio, 155 / 85);
});
test('duplicate reference assignments and missing references never generate ratios', () => {
  const { p, g, target, reference } = setup();reference.rois.push({ ...reference.rois[0], id: B.uid() });
  let r = B.records(p, g);assert.equal(r.find(r => r.objectId === target.id).ratio, null);assert.ok(r.filter(r => r.objectId === reference.id && r.sampleId === g.samples[0].id).every(r => !r.include));
  reference.rois = [];r = B.records(p, g);assert.ok(r.filter(r => r.objectId === target.id).every(r => r.ratio === null && /参照/.test(r.issue)));
});
test('duplicate sample IDs cannot enter statistics or reference normalization', () => {
  const { p, g, target } = setup();g.samples[1].id = g.samples[0].id;
  const r = B.records(p, g);assert.ok(r.every(r => !r.include));assert.ok(r.filter(r => r.objectId === target.id).every(r => r.ratio === null));
});
test('missing ROI sample mapping is explicit instead of silently omitted', () => {
  const { p, g, target } = setup();target.rois[0].sampleIndex = 999;assert.throws(() => B.records(p, g), /样本/);
});
test('multiple exposures of one sample cannot inflate biological n', () => {
  const r = [{ protein: 'P', include: true, sampleId: 'S1', group: 'C', corrected: 2 }, { protein: 'P', include: true, sampleId: 'S1', group: 'C', corrected: 3 }];
  const d = B.statData(r, 'P', 'corrected', 'C', true);assert.equal(d.rows.length, 0);assert.match(d.error, /重复样本/);
  r[1].include = false;assert.equal(B.statData(r, 'P', 'corrected', 'C', true).groups[0].n, 1);
});
test('all invalid observations and invalid metric are reported without synthetic values', () => {
  const rows = [null, NaN, Infinity, 0, -1].map(corrected => ({ protein: 'P', include: true, group: 'C', corrected }));
  assert.match(B.statData(rows, 'P', 'corrected', 'C', true).error, /对照/);
  assert.equal(B.statData(rows, 'P', 'corrected', 'C', false).groups.length, 0);
  assert.match(B.statData(rows, 'P', '__proto__', 'C', false).error, /指标/);
});
test('Holm correction identifies comparisons by index, including repeated group labels', () => {
  const r = B.holm([{ group: 'same label', p: .001 }, { group: 'same label', p: .4 }, { group: 'invalid', p: -1 }]);
  assert.equal(r[0].adjusted, .002);assert.equal(r[1].adjusted, .4);assert.ok(Number.isNaN(r[2].adjusted));
});
test('empty, singleton, nonfinite and zero-variance statistics are explicit', () => {
  assert.ok(Number.isNaN(B.summary([]).mean));assert.ok(Number.isNaN(B.summary([2]).sd));assert.ok(Number.isNaN(B.welch([1, NaN], [2, 3]).p));assert.ok(Number.isNaN(B.welch([1, 1], [2, 2]).p));
  assert.equal(B.summary([1e308, 1e308]).mean, 1e308);
});
test('Welch probabilities, degrees of freedom and scale invariance agree with SciPy', () => {
  const refs = JSON.parse(read('stats-reference.json'));
  for (const r of refs) {
    const actual = B.welch(r.a, r.b);for (const key of ['t', 'p', 'df']) assert.ok(Math.abs(actual[key] - r[key]) < 1e-10, key + ' ' + JSON.stringify(actual));
    for (const scale of [1e-200, 1e200]) { const changed = B.welch(r.a.map(v => v * scale), r.b.map(v => v * scale));assert.ok(Math.abs(changed.p - actual.p) < 1e-11); }
  }
});
test('ROI generation rejects empty, noninteger and unbounded lane counts', () => {
  for (const count of [0, -1, 1.5, Infinity, 201]) assert.throws(() => B.autoROIs({ x: 0, y: 0, w: 10, h: 10 }, count));
  assert.throws(() => B.autoROIs({ x: 0, y: 0, w: 1, h: 10 }, 2), /像素/);
});
const refs = JSON.parse(read('reference.json'));
for (const [name, expected] of Object.entries(refs)) test('Pillow independent full pixel reference: ' + name, async () => {
  const pages = await B.decodeTIFF(read(name));assert.equal(pages.length, expected.length);
  pages.forEach((page, i) => {
    const ref = expected[i];for (const k of ['width', 'height', 'bitDepth']) assert.equal(page[k], ref[k]);
    const bytes = Buffer.from(ref.samplesBase64, 'base64'), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let j = 0; j < page.samples.length; j++) assert.equal(page.samples[j], ref.bitDepth === 16 ? view.getUint16(j * 2, true) : bytes[j], `page ${i} pixel ${j}`);
  });
});
test('12 simulated 16-bit WB lanes agree with independent NumPy ROI calculations', async () => {
  const page = (await B.decodeTIFF(read('simulated-wb16.tif')))[0], s = source(Array.from(page.samples), 16, page.width), ref = JSON.parse(read('wb-reference.json'));
  assert.equal(ref.simulated, true);
  for (const r of ref.measurements) { const actual = B.measure(s, r.roi, ref.background);for (const key of ['area', 'mean', 'raw', 'backgroundMean', 'corrected']) assert.equal(actual[key], r[key]); }
});
function simpleTIFF({ w = 1, h = 1, depth = 8, compression = 1, bytes = Uint8Array.of(12), photo = 1, extraTags = [] } = {}) {
  const tags = [[256, 4, w], [257, 4, h], [258, 3, depth], [259, 3, compression], [262, 3, photo], [273, 4, 0], [277, 3, 1], [278, 4, h], [279, 4, bytes.length], ...extraTags], pixelsAt = 8 + 2 + tags.length * 12 + 4, a = new Uint8Array(pixelsAt + bytes.length), v = new DataView(a.buffer);
  tags[5][2] = pixelsAt;
  v.setUint16(0, 0x4949);v.setUint16(2, 42, true);v.setUint32(4, 8, true);v.setUint16(8, tags.length, true);
  tags.forEach(([tag, type, value], i) => { const at = 10 + i * 12;v.setUint16(at, tag, true);v.setUint16(at + 2, type, true);v.setUint32(at + 4, 1, true);type === 3 ? v.setUint16(at + 8, value, true) : v.setUint32(at + 8, value, true); });a.set(bytes, pixelsAt);return a;
}
function patchTag(a, tag, value, field = 'value') {
  const out = Uint8Array.from(a), v = new DataView(out.buffer), off = v.getUint32(4, true), count = v.getUint16(off, true);
  for (let i = 0; i < count; i++) { const at = off + 2 + i * 12;if (v.getUint16(at, true) !== tag) continue;v.setUint32(at + (field === 'count' ? 4 : 8), value, true);return out; }throw Error('missing tag');
}
function codes9(codes) {
  const out = new Uint8Array(Math.ceil(codes.length * 9 / 8));let pos = 0;for (const code of codes) for (let bit = 8; bit >= 0; bit--, pos++) out[pos >> 3] |= ((code >> bit) & 1) << (7 - (pos & 7));return out;
}
test('TIFF rejects truncated headers, empty files and out-of-range IFD pointers', async () => {
  for (const a of [new Uint8Array(0), Uint8Array.of(0x49, 0x49), patchTag(simpleTIFF(), 273, 99999)]) await assert.rejects(B.decodeTIFF(a), /TIFF/);
  const a = simpleTIFF();new DataView(a.buffer).setUint32(4, 0, true);await assert.rejects(B.decodeTIFF(a), /不含/);
  new DataView(a.buffer).setUint32(4, a.length - 1, true);await assert.rejects(B.decodeTIFF(a), /截断/);
});
test('TIFF rejects zero rows, mismatched strip counts, extra raw samples and non-gray photometry', async () => {
  for (const a of [patchTag(simpleTIFF(), 278, 0), patchTag(simpleTIFF(), 273, 2, 'count'), simpleTIFF({ bytes: Uint8Array.of(12, 13) }), simpleTIFF({ photo: 3 })]) await assert.rejects(B.decodeTIFF(a));
});
test('unsupported TIFF orientation, planar, predictor, sample format and tiles are explicit errors', async () => {
  for (const tag of [[274, 3, 2], [284, 3, 2], [317, 3, 3], [339, 3, 3], [266, 3, 2], [322, 4, 1]]) await assert.rejects(B.decodeTIFF(simpleTIFF({ extraTags: [tag] })), /支持/);
  await assert.rejects(B.decodeTIFF(simpleTIFF({ extraTags: [[259, 3, 1]] })), /重复/);
});
test('cyclic TIFF directories and unknown compression are rejected', async () => {
  const a = simpleTIFF();new DataView(a.buffer).setUint32(118, 8, true);await assert.rejects(B.decodeTIFF(a), /目录异常/);
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 7 })), /压缩/);
});
test('TIFF compression expands only to the exact expected strip length', async () => {
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 32773, bytes: Uint8Array.of(129, 7) })), /超过/);
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 5, bytes: codes9([256, 1, 1, 257]) })), /超过/);
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 5, bytes: codes9([256, 1]) })), /截断/);
  const got = await B.decodeTIFF(simpleTIFF({ compression: 5, bytes: codes9([256, 12, 257]) }));assert.equal(got[0].samples[0], 12);
});
test('Deflate truncation and over-expansion cannot create incomplete quantitative pixels', async () => {
  const { deflateSync } = require('node:zlib');
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 8, bytes: deflateSync(Uint8Array.of(1, 2, 3)) })), /超过/);
  await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 8, bytes: deflateSync(new Uint8Array()) })), /不足/);
  const encoded = deflateSync(Uint8Array.of(1));await assert.rejects(B.decodeTIFF(simpleTIFF({ compression: 8, bytes: encoded.subarray(0, encoded.length - 2) })));
});
test('mixed channel bit depths cannot silently decode as 8-bit RGB', async () => {
  const a = B.encodeTIFF(new Uint8Array([2, 3, 4, 255]), 1, 1), v = new DataView(a.buffer), count = v.getUint16(8, true);
  for (let i = 0; i < count; i++) { const at = 10 + i * 12;if (v.getUint16(at, true) === 258) v.setUint16(v.getUint32(at + 8, true) + 2, 16, true); }
  await assert.rejects(B.decodeTIFF(a), /支持/);
});
test('TIFF export validates geometry and writes exact RGB after white alpha composition', async () => {
  assert.throws(() => B.encodeTIFF(new Uint8Array(4), 0, 1));assert.throws(() => B.encodeTIFF(new Uint8Array(3), 1, 1));assert.throws(() => B.encodeTIFF(new Uint8Array(4), 1, 1, 0));
  const p = (await B.decodeTIFF(B.encodeTIFF(new Uint8Array([0, 0, 0, 0, 100, 100, 100, 128]), 2, 1)))[0];assert.deepEqual(Array.from(p.samples), [255, 177]);
});

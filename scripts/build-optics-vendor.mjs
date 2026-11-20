// Reproduce the pinned, dependency-free browser core. Normal builds use the
// committed output and do not require this development-only type stripping API.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as moduleApi from 'node:module';
const source=await fs.readFile('vendor/liquid-glass/liquid-glass.ts','utf8');
if(createHash('sha256').update(source).digest('hex')!=='d5a1599756c9d6b3184e6b0dfbed3de30a8b5760e01dc420d61ab52ec7d381b7')throw Error('Pinned upstream source hash differs; review the dependency before rebuilding.');
if(!moduleApi.stripTypeScriptTypes)throw Error('Regenerating the vendor requires Node.js 22.18+; ordinary app builds do not.');
let code=moduleApi.stripTypeScriptTypes(source.replace('import "./liquid-glass.css";',''),{mode:'strip'}).replace(/export function /g,'function ').replace(/export default applyGlass;/,'');
// Cached PNG strings outlive the temporary drawing canvas. Release its pixel
// backing as soon as the map is compiled, including when canvas allocation fails.
function generateDisplacementMap(options) {
  const key=JSON.stringify([options.width,options.height,options.radius,options.depth,options.dpr,options.specular,options.specularAngle,options.inset]);
  if(_blotMapCache.has(key))return _blotMapCache.get(key);
  const canvas=document.createElement('canvas');
  try {
    const url=renderDisplacementMap(options,canvas);
    if(!url||url==='data:,')return null;
    _blotMapCache.set(key,url);
    if(_blotMapCache.size>32)_blotMapCache.delete(_blotMapCache.keys().next().value);
    return url;
  } catch(error) {
    if(error instanceof RangeError||['QuotaExceededError','OutOfMemoryError','EncodingError'].includes(error?.name))return null;
    throw error;
  } finally {
    canvas.width=0;
    canvas.height=0;
  }
}
const mapHeader=/function generateDisplacementMap\([\s\S]*?\)\s*\{/;
const allocateCanvas='  const canvas = document.createElement("canvas");\n';
if(!mapHeader.test(code)||!code.includes(allocateCanvas))throw Error('Cannot locate pinned displacement-map code.');
code=code.replace(allocateCanvas,'').replace(mapHeader,()=>generateDisplacementMap.toString()+'\n\nfunction renderDisplacementMap(o,canvas) {');
code=code.split('\n').map(line=>line.trimEnd()).join('\n');
const license=await fs.readFile('vendor/liquid-glass/LICENSE','utf8');
const output='/*\n@tomagranate/liquid-glass core 0.0.2\nUpstream SHA: efe48923a08c026b77158f3df0317f83571a038d\nBlotStudio adaptation: bounded geometry-map cache, optical math unchanged.\n'+license+'*/\n(function(global){\nconst _blotMapCache=new Map();\n'+code+'\nglobal.LiquidGlassOptics={applyGlass,createGlassController,generateDisplacementMap,buildGlassFilter,moveFilterLens};\n})(globalThis);\n';
await fs.writeFile('src/liquid-glass-vendor.js',output);

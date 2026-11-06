// Reproduce the pinned, dependency-free browser core. Normal builds use the
// committed output and do not require this development-only type stripping API.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as moduleApi from 'node:module';
const source=await fs.readFile('vendor/liquid-glass/liquid-glass.ts','utf8');
if(createHash('sha256').update(source).digest('hex')!=='d5a1599756c9d6b3184e6b0dfbed3de30a8b5760e01dc420d61ab52ec7d381b7')throw Error('Pinned upstream source hash differs; review the dependency before rebuilding.');
if(!moduleApi.stripTypeScriptTypes)throw Error('Regenerating the vendor requires Node.js 22.18+; ordinary app builds do not.');
let code=moduleApi.stripTypeScriptTypes(source.replace('import "./liquid-glass.css";',''),{mode:'strip'}).replace(/export function /g,'function ').replace(/export default applyGlass;/,'');
// Adapter-only performance patch: reuse identical geometry maps across DOM
// repaints, while upstream still creates a fresh filter ID for WebKit safety.
code=code.replace(/(function generateDisplacementMap\([\s\S]*?\)\s*\{)/,header=>header+'\nconst _blotKey=JSON.stringify([o.width,o.height,o.radius,o.depth,o.dpr,o.specular,o.specularAngle,o.inset]);if(_blotMapCache.has(_blotKey))return _blotMapCache.get(_blotKey);\n').replace('return canvas.toDataURL("image/png");','const _blotURL=canvas.toDataURL("image/png");_blotMapCache.set(_blotKey,_blotURL);if(_blotMapCache.size>32)_blotMapCache.delete(_blotMapCache.keys().next().value);return _blotURL;');
code=code.split('\n').map(line=>line.trimEnd()).join('\n');
const license=await fs.readFile('vendor/liquid-glass/LICENSE','utf8');
const output='/*\n@tomagranate/liquid-glass core 0.0.2\nUpstream SHA: efe48923a08c026b77158f3df0317f83571a038d\nBlotStudio adaptation: bounded geometry-map cache, optical math unchanged.\n'+license+'*/\n(function(global){\nconst _blotMapCache=new Map();\n'+code+'\nglobal.LiquidGlassOptics={applyGlass,createGlassController,generateDisplacementMap,buildGlassFilter,moveFilterLens};\n})(globalThis);\n';
await fs.writeFile('src/liquid-glass-vendor.js',output);

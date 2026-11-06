# Vendored optical core

Upstream: https://github.com/tomagranate/liquid-glass

Version: 0.0.2; commit `efe48923a08c026b77158f3df0317f83571a038d`.

License: MIT, reproduced in LICENSE and the browser bundle header. The upstream
core source is retained unchanged. React and WebGL entry points are not bundled.

The browser IIFE is reproducible with Node.js 22.18+:

    node scripts/build-optics-vendor.mjs

Ordinary builds use the committed IIFE and need no package download. The conversion removes TypeScript types, the CSS import and ESM export keywords.
A documented BlotStudio performance adaptation adds a bounded geometry-map PNG
cache; upstream optical mathematics are unchanged and fresh filter IDs are retained.
The UI adapter uses createGlassController on decorative ambient-background
copies; it never filters the scientific image/ROI/export layer.

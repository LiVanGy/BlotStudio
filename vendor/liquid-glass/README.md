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
The UI adapter uses generateDisplacementMap and buildGlassFilter in separate,
explicitly sized SVG viewports for a thin rim only. Native CSS backdrop-filter
samples actual live DOM. A read-only, event-driven app DOM/SVG scene copy gives
the refracting rim changing content on WebKit and Blink. This is not a complete
browser compositor capture or Apple's native material. Scientific image/model
and export buffers stay untouched.

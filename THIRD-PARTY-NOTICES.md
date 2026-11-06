# Third-party notices

Application source: MIT, see LICENSE.

Rolling-ball geometry, shrinking, interpolation, integer subtraction and ellipse verification follow public-domain ImageJ1, with attribution to Wayne Rasband, Michael Schmid and ImageJ contributors:

- https://github.com/imagej/ImageJ
- https://github.com/imagej/ImageJ/blob/master/ij/plugin/filter/BackgroundSubtracter.java
- https://imagej.net/ij/disclaimer.html

Unmodified ImageJ 1.54g generated the synthetic independent references. The ImageJ JAR and temporary Java runtime are not distributed. Microsoft .NET and WebView2 retain their respective licenses; application MIT does not replace them.

No WBsolverunion code, proprietary assets, license keys or user research files are included.

## Liquid glass optical core

@tomagranate/liquid-glass 0.0.2, copyright (c) 2026 Tom, MIT.
https://github.com/tomagranate/liquid-glass
Pinned commit: efe48923a08c026b77158f3df0317f83571a038d.
The full upstream license is in vendor/liquid-glass/LICENSE and in the HTML
bundle header. The original core source is retained. The browser adaptation
adds a bounded geometry-map cache without changing the optical equations.
Native CSS backdrop-filter samples actual live DOM. The application's own
read-only DOM/SVG scene copy supplies a thin refracting rim through the optical
core. Scientific model pixels and export buffers are neither modified nor
filtered. This is a cross-platform Apple-style implementation, not Apple's
native Liquid Glass renderer or a complete browser compositor capture.

The button and frame supplement uses an original signed-distance normal /
Fresnel lighting implementation, a bounded normal cache and the same read-only
scene. Apple reference screenshots are used for local design comparison only;
no Apple screenshots, SF font files or proprietary native material are bundled.

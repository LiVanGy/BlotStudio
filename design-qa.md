# BlotStudio v0.8 Design QA

final result: passed

## Comparison target and evidence

The selected direction is Apple's Liquid Glass design language, applied to the existing WB application whose scientific layout is retained. The source is the official [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [HIG Color](https://developer.apple.com/design/human-interface-guidelines/color) and [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/). These define materials and hierarchy, not a screenshot of the same WB product. This is a design-language comparison, not a claim of pixel-identical Apple UI or the native Apple renderer.

Reference visual truth: `v08-audit/06-apple-regular-glass.png`, captured from Apple's rendered HIG page during this audit. Implementation evidence: `08-after-editor-refined.png`, `09-after-synthetic-figure.png`, `10-after-content-under-glass.png`, `11-after-synthetic-analysis.png`, `13-final-empty-editor-1280.png`, `14-final-empty-800.png`, `15-final-open-sidebar-800.png`. The local proof packet is kept separately; Apple screenshots and synthetic projects are not distributed in release packages.

Source HIG and main IAB implementation captures are 1280 x 720 pixels at 1280 x 720 CSS viewport, density 1. The two independent macOS WK snapshots are 1600 x 1800 pixels at an actual 800 x 900 CSS viewport, density 2; these were judged at their CSS scale. The IAB viewport override did not take effect and was not counted as an 800-pixel result. The application starts with no seeded images, samples or objects.

## Full-view and focused comparison

The official material reference and current application images were opened together in one comparison input. Compared with the previous blue-wallpaper implementation, the content plane is now neutral and opaque, with glass restricted to navigation and functional surfaces. Floating tools sit over the actual canvas, and content was manually scrolled beneath them. No large tinted glass sheet competes with scientific content. Large sidebar and menu materials remain stable; compact controls adapt to the sampled backdrop.

Focused inspections used the readable 800-pixel Retina snapshots for inspector text, selection state, toolbar geometry and border weight. The actual analysis screenshot confirms that ROI and table content remain in the clear content plane. The source reference's circular material samples are not the same geometry or content as this application; no false pixel-precision score was assigned.

## Findings and comparison history

- Earlier P1: blue static wallpaper, thick white highlights and content-layer glass produced a plastic appearance. Fixed by removing that wallpaper and content filters, using a neutral content plane and thinner functional surfaces. Verified in 08/09/10/11/13.
- Earlier P1: the material only referenced a static environment image. Fixed with live compositor backdrop sampling and a read-only application scene texture for the refracting rim. The live WebKit suite verifies actual red-to-blue DOM pixel changes, automatic refracting-source changes, tone adaptation and idle cessation; 10 also shows real figure labels passing underneath the toolbar.
- Earlier P2: inspector active tab retained an old blue underline. Fixed with an explicit border reset. Verified in 08/13/14/15.
- Earlier P2: inspector empty-state copy inherited low-contrast blue-grey. Fixed with neutral readable secondary text. Verified in 08/13/14/15.
- No remaining actionable P0/P1/P2 was observed in the reviewed states.

## Required fidelity surfaces

- Typography: platform SF / PingFang typography, restrained weights and scale; neutral dark labels and readable secondary text. Dense scientific text and fields remain readable without an optical filter.
- Spacing and rhythm: existing scientific three-pane layout retained; functional tools float in a bounded editor region. Actual 800 x 900 tests with sidebar hidden and open verify header/toolbar controls stay within viewport, and their center points hit the intended nodes.
- Color and tokens: neutral greys, a single system-blue primary emphasis, light hairlines and restrained elevation. Compact material brightness has hysteresis; large regular surfaces do not flip appearance.
- Image quality: scientific source/display layers remain separate from decorative optics. Existing image export pixel tests pass. No source illustration, brand asset or icon was replaced by generated decorative art, and no Apple proprietary assets are bundled.
- Copy and content: original scientific labels and workflow names retained. Blank start has no test groups or generated bands. Synthetic audit content was loaded only into an isolated local review project and the preview was restored to an empty project.

## Interaction and verification

IAB audit exercised page navigation, project menu, actual project file chooser/open, figure zoom, scroll under the floating toolbar, analysis navigation and empty-project creation. Browser warning/error logs were empty. Independent WebKit suites pass 9 pixel checks, 17 application flows and 10 live-material checks. Functional additions cover denominator delete/undo, duplicated references, cross-project originals, source-ID collision and real keyboard copy/paste/undo/redo. Full Node independent comparisons pass 181 tests.

## Limits and follow-up

The rim texture is a controlled read-only DOM/SVG drawing, not a complete pixel-identical compositor capture. Apple-native material is not claimed. Reduced-motion change handling is tested on native MediaQueryList objects in an isolated fixture; system CSS settings were not manually changed. Screenshots do not prove full accessibility compliance. Windows and ARM64 device manual acceptance remains distinct from automated checks and cross-architecture compilation. No P3 refinement is required for this release's acceptance.

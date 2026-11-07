# BlotStudio v0.9.1 Preview · Frosted Background

界面采用浅色半透明磨砂背景，配置 alpha 0.68、30px 模糊和 115% 饱和度，让按钮和边框的通透亮边更突出。工作区去除实色灰底，面板和欢迎卡片保持清晰可读。

修复半透明折射的颜色通道重复叠加透明度所产生的灰色槽边，并避免 WebKit 重复绘制背景。新项目保持空白，不预置测试组别或模拟条带；科研画布默认不透明白底，原图、定量数据和导出保持独立。

Mac 已配置公开的 NSVisualEffectView 窗口后方磨砂材质；用户桌面模糊尚未肉眼验收，WKWebView 去白底使用带可用性检查的 `drawsBackground` 私有 SPI。Windows 的透明 WebView2 显示白色宿主，不提供桌面模糊；浏览器材质限于网页内容。本版本不使用 Apple 原生 Liquid Glass 引擎。

现有验证记录：181/181 项逻辑检查、50/50 项 WebKit 检查通过；实际 PNG 空白背景 alpha 为 173，科研白纸输出保持 RGBA 255/255/255/255。

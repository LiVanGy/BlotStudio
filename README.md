# BlotStudio 0.9.1

免费、离线、MIT 开源的 Western blot 分析与自由排版工作台。

[下载](https://github.com/LiVanGy/BlotStudio/releases) · [功能对照与验收](docs/FEATURE-PARITY.md) · [材质复核](design-qa.md)

## 0.9.1 半透明磨砂背景

整体底色改为浅色半透明磨砂层：应用背景使用 `rgba(235,239,245,.68)`，配置 30px 模糊与 115% 饱和度，工作区去除实色灰底。按钮、面板和欢迎区保留更清晰的玻璃承托层。新项目保持空白，科研画布默认不透明白底，原图、定量像素与导出不随界面材质改变。

修复半透明折射中的 RGB 通道透明度重复叠加，合并颜色后仅恢复一次实际覆盖率，消除灰色槽边；背景放在应用容器而非 body，避免 WebKit 重复叠画底色。现有记录为 181 项逻辑检查和 50 项 WebKit 检查全部通过，详见[材质复核](design-qa.md)。

Mac 已配置公开的 NSVisualEffectView 窗口后方磨砂材质，透明 WKWebView 位于其上；用户桌面后方模糊尚未肉眼验收。清除 WebKit 默认白底使用带可用性检查的 `drawsBackground` 私有 SPI，不支持时保留默认底色。Windows WebView2 的透明像素显示白色宿主，不提供桌面模糊；浏览器材质也限于网页内容。本项目不使用 Apple 原生 Liquid Glass 引擎，不读取应用外桌面截图。

## 0.9 按钮与边框的实时玻璃

对照 Apple 实际 [Done / Share 控件](https://developer.apple.com/design/human-interface-guidelines/color#Liquid-Glass-color) 和 [Landmarks 工具栏](https://developer.apple.com/tutorials/images/com.apple.SwiftUI/Landmarks-Building-an-app-with-Liquid-Glass-4@2x.png) 重做按钮材质，保留已有科研排版与中性内容层。

- 独立主按钮、图标按钮和选中胶囊具有自己的实时折射镜缘，文字、图标保持独立清晰。
- 工具条内的控件共享父材质，仅增加清透轮廓与局部光照，避免重复模糊。面板只增加外围光学环，内容区保持清晰。
- 材质覆盖各工作页的主操作、按钮行、弹窗，以及折叠/滚动后出现的动作；选中胶囊随布局变化对齐。
- 曲面法线光照随指针变化，按压后恢复；复用当前场景和有界几何缓存，空闲时不持续绘制。
- 蓝色按钮保持窄青蓝镜缘，标签下方的中心亮度根据真实底色适应。四组明暗和高饱和底色的白字中心对比度检查为 4.68–6.12:1；这不代表整款应用已通过完整无障碍认证。
- 保持空白启动，不预置测试分组或模拟条带；已有真实项目继续保留。

真实 DOM 背景由浏览器 CSS `backdrop-filter` 处理；MIT 开源 [@tomagranate/liquid-glass](https://github.com/tomagranate/liquid-glass) 的位移函数处理只读应用场景副本的局部折射。科研内容节点、原始定量数据和导出缓冲区保持独立。本项目按 Apple 的实际控件视觉与交互重构，不是 Apple 原生材质引擎，也不是浏览器私有合成器的完整逐像素截图。支持减少透明度、减少动态效果与增强对比度。

此前修复的内参引用清理、分析面板复制关系和跨项目粘贴来源保护继续保留。

## 使用

Windows 完整解压后打开 BlotStudio.exe，需要 Microsoft Edge WebView2 Runtime；.NET 运行时随包提供。Mac 需要 macOS 13 或以上，打开 BlotStudio.app。免安装版直接用现代浏览器打开 BlotStudio.html。无需账号、Java、Python 或订阅。

1. 新建项目与图组。“项目工具 → 实验设计向导”支持单因素、多因素矩阵和 ± 条件，预览后应用。样本 ID、分组、重复编号和纳入状态均可编辑。
2. 导入图片后自动定位 ROI，手动核查位置、大小及对应样本。“灰度计算方式”支持原生位深、范围缩放 8-bit、RGB 等权平均或加权亮度、矩形 / 椭圆 / 泳道峰面积、不扣背景 / 背景框均值 / ImageJ1 滚球。可统一整个图组。
3. 指定内参、总蛋白和参照关系。显示亮度、对比度、反相及排版旋转不改变定量；分析校正旋转另行记录坐标系。
4. 快速排版支持统一宽度、高度、高宽中心裁剪或自由尺寸；标签位置、间距、框线、样式同步均可编辑。自由画布支持独立对象、图层、组合、对齐、等距、旋转、复制 / 剪切 / 粘贴和撤销。
5. 查看灰度、目的/内参、部分/总蛋白比值和对照均值归一化。统计名称映射保留原始注释；重复样本 ID 会阻止合并统计虚增 n。

实验设计中的“开始实验”记录多凝胶、电泳、转膜、上样量、多轮抗体孵育和洗膜。计划体积按输入浓度及目标量计算，实际用量独立记录。样品库和抗体库支持增删改，抗体选择保留产品快照。

目录支持课题、实验、图组、重命名、折叠、选择、提升下级、删除与恢复。“项目工具 → 文件管理”支持目录备份与同步，重启后需重新选择目录。收到系统写入确认后才报告成功。

## 导出

| 格式 | 内容 |
|---|---|
| .wbproj | 原图、原始像素、ROI、方法、图层、资料、条件与操作记录 |
| XLSX / CSV | 灰度、比值、方法、位深、ROI 坐标系、原图哈希及统计 |
| SVG | 独立文字、形状和图片；单文件嵌入或链接图片 ZIP |
| PNG / JPG / TIFF | 指定倍率组图；PNG / TIFF 带 DPI；TIFF 排版图为 8-bit RGB |
| PPTX | 可分别编辑的图片、文字、形状、原生裁剪 / 翻转 / 透明度 |
| 原图与记录 ZIP | 原始文件、完整项目及记录 |

分范围 Excel 支持当前图组、当前实验、当前课题。不同平台自动保存空间独立，请定期导出项目。浏览器只能确认发起下载；桌面版等待保存结果。

## 方法与边界

旧项目保留原方法。新图默认按整图范围转 8-bit、RGB 等权平均、滚球半径 50、矩形 ROI；半径 0 关闭滚球。原始文件与定量像素始终保留。

滚球依据公开的 ImageJ1 算法独立实现。未修改的 ImageJ 1.54g 提供独立参考：72 组配置、28,152 个像素一致，81 种椭圆面积一致。峰面积为均值曲线与线性基线之间正值的梯形积分，单位不同于矩形积分。显示使用独立 sRGB 副本，修复 WebKit 恒等 SVG 滤镜的量化偏移。

积分不是经标定的光密度或绝对蛋白量。不同曝光、膜、位深和方法的绝对值不能直接比较；技术重复不能直接作为生物学重复。推断统计为独立双侧 Welch 检验及 Holm 校正，不包含配对、重复测量或多因素统计模型。

支持标准 strips TIFF：8/16-bit 无符号灰度、8-bit RGB、大小端、多页、未压缩 / LZW / PackBits / Deflate、WhiteIsZero。资源上限：单图 3200 万像素 / 80 MB，图组 200 泳道，项目 220 MiB，导出 6400 万像素。不支持 BigTIFF、tiled、浮点或 16-bit RGB TIFF、高位深 PNG。没有数量付费限制。

Mac 为 ad-hoc 签名，未 Apple 公证；Windows 未商业代码签名。编译成功不等于所有系统对话框和 ARM64 设备均已实机验收。界面和内部文件格式不同；未声明兼容参考软件的内部项目。

## 开发

构建需要 Node.js 18+，没有第三方 npm 依赖。完整测试另需 Python 3 的 NumPy、Pillow、SciPy、openpyxl；原生协议和 WebKit 测试需 macOS / Xcode Command Line Tools。

    python3 -m pip install numpy pillow scipy openpyxl
    npm run test:all
    npm run build
    npm run build:mac
    node scripts/test-webkit.mjs

模拟图片与项目仅在临时目录生成，测试后清理，不进入发布包。Windows 使用 .NET 8，发布命令：

    dotnet publish native/windows/BlotStudio.csproj -c Release -r win-x64 --self-contained true -o dist/windows-x64

本项目独立实现，不包含参考软件代码、品牌素材、激活系统或用户实验资料。第三方说明见 THIRD-PARTY-NOTICES.md。

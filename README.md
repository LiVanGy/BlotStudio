# BlotStudio 0.4.0 Preview

完全免费、无需账号、离线运行的 Western blot 灰度分析与组图工作台。源码采用 MIT 许可证。这个版本根据可见工作流独立实现，没有复制参考软件代码、图片或数据，也不导入其专有项目格式。

本次公开包暂未包含静态 examples 附件。直接打开仓库根目录的 `BlotStudio.html` 即可使用。完整测试的本地记录为 148 项通过；公开 CI 先运行不依赖未发布附件的测试子集（`node scripts/test-ci.mjs`）。三个依赖附件的测试文件暂不计入 CI 通过数。

## 下载

[GitHub 发布页](https://github.com/LiVanGy/BlotStudio/releases) 提供 macOS、Windows x64 / ARM64 和跨平台 Web 离线包。预发布只在全部自动测试与各架构编译成功后生成；真实窗口验收状态见 [发布说明](RELEASE-NOTES.md)。

## 立即使用

- **Mac（macOS 13 或以上）**：按 CPU 选择 arm64（Apple Silicon）或 x64（Intel）包，打开 `BlotStudio.app`。
- **Windows 10 / 11**：按 CPU 选择 x64（一般 Intel / AMD）或 ARM64 包；完整解压后打开 `BlotStudio.exe`，需要 Microsoft Edge WebView2 Runtime。缺少运行时可从微软官方下载，或直接使用 Web 离线包。
- **Mac / Windows / Linux**：用现代 Chrome、Edge 或 Safari 打开 `BlotStudio.html`。不需要安装依赖或启动服务器。
- 初次打开是明确标记的模拟演示项目。点击「新项目」开始空项目；也可以直接导入原图，软件会创建真实工作图组。
- 文件中的 `源码` 文件夹包含完整实现、构建工具和自动测试；`模拟WB测试数据` 包含可直接打开的测试项目和独立参考值。软件没有付费开关、试用倒计时、联网请求或导出水印。

Mac 应用未进行 Apple 商业开发者签名与公证；若系统阻止打开，可先使用离线 HTML 版，不需要降低系统安全设置。Windows 原生程序未进行商业代码签名。可选择免安装 HTML 版。

## 四个工作步骤

1. **实验设计**：维护实验 / 图组、泳道、样本 ID、分组、重复编号、纳入状态和备注；管理样品库、抗体库及上样 / 一抗计划。各表支持新增、编辑、删除，随项目保存。
2. **图片分析**：导入多张原始图；设置蛋白名、分子量、信号方向及参照蛋白。按泳道生成 ROI，或逐一框选；框选背景、显示裁剪范围；拖动 ROI 或修改其坐标。不同蛋白的原图尺寸完全相同时可同步 ROI。
3. **排版编辑**：图片、蛋白名、分子量、分组标签、图注、线段、矩形、箭头、括号均为独立对象。支持拖动、右下角缩放、任意旋转、精确坐标、锁定比例、图层显隐、锁定、顺序、复制、组合、对齐、等距、吸附、快速排版和撤销 / 重做。图像显示支持亮度、对比度、灰度、反相、翻转、透明度；原始像素不改变。
4. **统计结果**：计算每条泳道的背景校正积分、目的 / 内参或部分 / 总蛋白比值，按对照组均值归一化为 1；绘制单点、均值及 SD，列出 n、SD、SEM。可选独立样本双侧 Welch t 检验，各实验组相对于所选对照组进行 Holm 校正。

0.3.0 新增「ImageJ 方法」区域：显示 Area / Mean / RawIntDen / IntDen，绘制 ROI 行列均值曲线，导出测量表、曲线 CSV 和原版 ImageJ 复核包。内置的是未校准、无阈值矩形的方法兼容层；完整 Java 引擎、Gel Analyzer 人工峰面积和滚动球尚未内置。详见 `ImageJ方法与复核.md`。

左侧勾选多个图组后，可以汇总统计，或将它们的排版副本合为多面板画布。多面板副本保留原组图的分析；为避免样本错配，排版副本自身不复制 ROI 定量。

## 保存与导出

| 格式 | 保存的内容 |
|---|---|
| `.wbproj` | 全部原图字节、原始定量像素、图组、ROI、背景、显示参数、对象、资料及操作记录 |
| PNG | 指定像素倍率的组图，写入 DPI 元数据 |
| SVG | 独立文字、形状、内嵌条带图及显示滤镜，适合进一步矢量编辑 |
| PPTX | 图片、文字、形状为独立对象；保留完整显示预览图及原生裁剪、翻转、旋转、透明度。亮度 / 对比度 / 反相效果固定在预览图中，原始定量数据保留在项目文件 |
| TIFF | 未压缩 8-bit RGB 组图，带 DPI；用于排版交付，不能替代原始 16-bit 定量文件 |
| XLSX / CSV | 灰度、背景校正、参照比值、ROI 坐标、位深、来源、原图哈希及提示；从统计页导出时另含当前统计设置、逐样本归一化结果、分组汇总及已启用的检验结果 |
| 原图与记录 ZIP | 原始图像、完整项目和操作记录 |

浏览器 / Mac / Windows 应用会自动保存当前项目到其本地数据空间。不同浏览器、不同文件路径或 Mac 应用之间不保证共享自动保存位置；清理浏览器数据会影响本地恢复。重要工作请使用「保存项目」导出 `.wbproj`，下次通过「打开项目」恢复。

Mac 和 Windows 原生导出等待保存面板的实际结果，取消或写入失败不会提示成功；关闭应用时等待本地自动保存，失败时提示处理。浏览器只能确认发起下载，请在浏览器下载记录中确认文件已保存。

导出不会添加强制水印。演示画布里的「演示数据」是正常文本对象，使用真实实验时应新建项目。Mac 版本的「文件 → 打印 / 保存 PDF」可用于 PDF 输出。

## 定量算法与边界

- **深色条带**：无背景时，积分为 `最大灰度 × 面积 − ROI 像素和`；有背景框时，校正积分为 `背景平均灰度 × 面积 − ROI 像素和`。
- **浅色条带**：无背景时使用 ROI 像素和；有背景时使用 `ROI 像素和 − 背景平均灰度 × 面积`。
- 灰度 TIFF 在原生 8-bit / 16-bit 数据上计算；TIFF 的 WhiteIsZero 按光度标签转换到统一的亮度方向。原文件字节同时保存。预览用 8-bit 亮度图，不参与 16-bit 定量。
- RGB PNG / JPEG / WebP / TIFF 按 `0.299R + 0.587G + 0.114B` 计算亮度。透明区域先按白色背景合成。JPEG 属有损图像，定量时优先使用成像仪原始 TIFF。
- 积分信号不等于经过标定的光密度，也不等于绝对蛋白含量。不同曝光、位深、膜或算法的绝对积分不可直接比较。
- 负的背景校正值原样保留在数据表，不能参与正值比值和当前统计。缺失 / 非正的参照不会生成比值；重复样本 ID 或重复 ROI 分配会被拒绝。跨图组合并时，同一蛋白出现重复样本 ID 会阻止统计，避免复制图组或重复曝光虚增 n。
- 饱和 / 灰度端点像素比例超过 1% 会提示核查。提示不能替代曝光线性范围验证。
- 同一膜的每条泳道不自动成为独立生物学重复。技术重复需要先合理汇总，再进行独立样本检验。当前不支持配对、重复测量、混合模型或多因素统计。

方法参考：[ImageJ Analyze 文档](https://imagej.net/ij/docs/menus/analyze.html)、[ImageJ 图像强度处理文档](https://imagej.net/imaging/image-intensity-processing)。本软件使用背景 ROI 均值扣除，没有把它宣称为 ImageJ rolling-ball 或 Gel Analyzer 峰面积算法。

## 支持的图像

- 标准 TIFF：单页 / 多页，8-bit / 16-bit 无符号灰度，8-bit RGB；strips 存储；未压缩、LZW、PackBits、Deflate；大端及小端。
- PNG / JPEG / WebP：浏览器支持的 8-bit 彩色图像，转亮度定量。
- 不支持 BigTIFF、分块 TIFF、平面分离、特殊 TIFF 方向、浮点 TIFF、16-bit RGB 或高位深 PNG。这些格式会报错，避免静默降位深。
- 资源保护上限：单图 3200 万像素、原始文件 80 MB、TIFF 32 页且各页合计不超过 6400 万像素、单图组 200 条泳道、导出 6400 万像素；单项目含原图的 JSON 最多 220 MiB。导入、编辑、保存和打开统一检查项目容量，超限需另建项目，仅拆图组不会减小同一项目容量。没有按数量收费或解锁的设计。

## 快捷键

| 操作 | 按键 |
|---|---|
| 撤销 / 重做 | ⌘/Ctrl Z；⇧⌘Z 或 Ctrl Y |
| 保存项目 | ⌘/Ctrl S |
| 复制对象 | ⌘/Ctrl D |
| 全选画布对象 | ⌘/Ctrl A |
| 组合 / 取消组合 | ⌘/Ctrl G；⇧⌘/Ctrl G |
| 多选 | 按住 ⌘/Ctrl 或 Shift 点击；空白处拖框 |
| 微调 | 方向键 1 px；Shift + 方向键 10 px |
| 临时关闭吸附 | 拖动时按住 Alt / Option |
| 删除 / 取消选择 | Delete；Esc |

## 版本范围和验证状态

这个版本实现了已观察到的四步核心工作流，但**没有把截图之外的隐藏功能认定为已经逐项一致**。最终执行 `npm run test:all`，**148 项通过，0 失败，0 跳过**（本地 macOS 环境，含 5 项 Windows 前端保存桥测试），完整输出见 `测试记录-v0.4.0.txt`。其中交互逻辑使用明确的 DOM / Canvas / IndexedDB 桩，不等于真实界面操作验收。详细整改、证据与未验收项见 `整改与测试说明.md`。

| 项目 | 状态 |
|---|---|
| 数学、ROI、参照匹配、显示 / 定量分离 | 自动测试通过；3 张模拟 16-bit WB 的 36 个 ROI 对照 NumPy；12 条 p-Akt/Akt 归一化结果一致 |
| TIFF 解码 | 17 个文件、19 页、337,266 个像素与独立 Pillow 结果一致，含大小端、压缩、预测器、多页及 WhiteIsZero |
| Welch t 检验 / Holm 校正 | SciPy 参考值、重复标签及极小 / 极大数值回归通过 |
| XLSX | ZIP / XML、openpyxl 实际读取及独立参考值验证 |
| SVG 文本转义、项目安全校验 | 自动测试通过 |
| 导出几何、PPTX 对象和关系结构 | 自动测试和独立 XML / 图像文件检查；模拟 PPTX 在 PowerPoint 原生打开、文字 / 图片 / 形状实际编辑通过，Keynote 尚未验证 |
| Mac 应用 | 本地 Apple Silicon / macOS 13 目标构建、保存通信 / 退出等待逻辑测试通过；Intel 构建由 CI 校验；原生窗口与保存面板尚未实机验收 |
| Windows 应用 | 前端保存桥测试通过；x64 / ARM64 原生程序由 CI 编译，发布以 CI 成功为准；原生保存面板与 ARM64 设备尚未实机验收 |
| 桌面、移动端界面 | 浏览器 / WebKit 渲染验证受当前环境限制阻断；8 项真实浏览器像素自检已准备，未运行、未计入通过数 |

重点待补：对参考软件隐藏项逐项验收、专有项目格式兼容、任意选取 / 重排泳道的显式拼接及标记、完整 ImageJ 引擎、更复杂的背景算法和统计、打印 / Keynote 真实兼容测试。当前画布支持多图 / 多面板组合；同一原图可复制后各自裁剪，但不会伪造泳道连续性标记。

## 从源码构建

需要 Node.js 18 或更新版本。没有第三方 npm 依赖，不需要 `npm install`。

```sh
npm run test:all
npm run build
```

产物是 `dist/BlotStudio.html`。修改 `src/` 后重新构建即可。核心模块：`core.js` 项目 / ZIP / XLSX，`science.js` 定量 / 统计，`imagej.js` / `imagej-ui.js` / `imagej-interop.js` 方法 / 曲线 / 复核包，`tiff.js` 原生解码，`scene.js` SVG，`io.js` 本地保存 / 导入，`pptx.js` Office 导出，`ui.js` 界面，`app.js` 操作逻辑。`npm test` 运行不含原生外壳的测试；完整独立复核需要 Python 3、NumPy、Pillow、SciPy、openpyxl，原生协议测试需要 macOS 的 Swift 编译器。缺少可选运行环境时部分独立复核会跳过，应查看测试输出。

Mac 开发机安装 Apple Command Line Tools 后：

```sh
npm run build:mac
```

原生外壳是 Cocoa + WKWebView；不会修改其他软件、扫描个人文件或连接远程服务。原图只通过你选择的文件导入。

Windows 开发机安装 .NET 8 SDK 后：

```sh
npm run build
dotnet publish native/windows/BlotStudio.csproj -c Release -r win-x64 --self-contained true -o dist/windows-x64
```

`native/windows` 使用 WinForms + WebView2；`scripts/package-release.mjs` 生成离线发布包。GitHub Actions 同步构建 Mac arm64 / x64、Windows x64 / ARM64，并附源码和 SHA256 校验值。Windows 本地数据保存在 `%LOCALAPPDATA%/BlotStudio/WebView2`。

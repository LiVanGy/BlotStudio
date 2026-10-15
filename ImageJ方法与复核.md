# 内置 ImageJ 方法与原版复核

BlotStudio 0.3.0 按你强调的分析用途，内置了 ImageJ1 的部分测量定义和曲线方法，离线可用。**这是 JavaScript 方法兼容层，没有把完整 ImageJ Java 程序或 Fiji 打包进应用。**

## 软件里怎样使用

在「图片分析」中导入原图并框选 ROI，页面的「ImageJ 方法」区域显示当前选中 ROI 的测量。没有选中时使用第一个 ROI；点击原图绿色框或结果表切换样本。

| 项目 | 当前定义 |
|---|---|
| Area | 有效整数矩形内的像素数，单位 px² |
| Mean | 原始像素平均灰度 |
| RawIntDen | 原始像素值之和 |
| IntDen | Area × Mean；当前没有空间或灰度校准 |
| 方向积分 | 深色条带为 `(2^位深 − 1) × Area − RawIntDen`；浅色条带为 RawIntDen |
| 背景校正信号 | 深色条带为 `背景均值 × Area − RawIntDen`；浅色条带反向相减 |
| 行 / 列曲线 | 矩形 ROI 每一行 / 列的平均灰度，对应 ImageJ Plot Profile 的均值曲线定义 |

「测量 Excel」导出全部 ROI 的以上值和实际整数坐标。「曲线 CSV」导出当前 ROI 的完整曲线及原图绝对坐标。曲线窗口最多显示约 800 个采样点，CSV 保留完整数据。勾选「全位深反相曲线」时固定使用 255 或 65535 减灰度，不依赖 ImageJ 用户偏好。

鼠标框选的非整数 ROI 按本软件覆盖到的有效整数像素范围测量，复核包导出同一组整数坐标。当前限于 8 / 16 位灰度、无阈值、无灰度 / 空间校准的矩形；不能把这里的 IntDen 与已校准的 ImageJ 测量混用。

## 用原版 ImageJ 复核

「ImageJ 复核包」包含原生位深的标准灰度 TIFF、实际 ROI / 背景坐标、参考结果和 `.ijm` 宏。TIFF 从定量像素生成，不使用排版预览；因此已转换为亮度的 RGB 图应与该 TIFF 对比，而不是依赖 ImageJ 的 RGB 转换偏好。

解压复核包，在 ImageJ 中运行附带宏，选择解压目录，生成重算结果再与 expected.csv 对照。宏不会清空用户已有的 Results 表。宏输出的方向积分与背景校正是基于 ImageJ 原始统计的显式算式。

本轮独立 NumPy 参考核对 36 个 ROI，另测行 / 列平均、16 位精度、反相、非法选项和导出逻辑。**当前环境没有 Java 运行时，未成功取得官方 JAR，附带宏未在原版 ImageJ 中执行；没有声称已完成原版引擎逐值验收。**

RawIntDen 按整数像素求和；ImageJ Results 使用均值乘像素数时可能出现浮点尾数差。复核宏使用原始直方图求和，背景扣除按复核包注明的浮点容差比较。

## 方法边界

Gel Analyzer 的完整流程是泳道曲线、人工画基线 / 封闭峰、Wand 峰面积；它不同于矩形像素积分。当前未内置该人工峰面积流程，也没有把普通形态学开运算当作 ImageJ rolling ball。完整滚动球、阈值、光密度校准或插件需要独立接入与原版交叉测试。

原图、测量值、参照匹配和排版对象仍保存在 `.wbproj`。ImageJ 方法区没有改写原始像素，也不会因调整显示亮度 / 对比度而改变结果。

## 官方来源与许可

ImageJ1 核心官方声明属于公有领域，可进行集成；Fiji、ImageJ2 及各插件有各自许可，不能把核心声明自动套到所有插件。BlotStudio 的方法层是独立 JavaScript 实现，源码继续采用 MIT 许可。

- [ImageJ1 官方声明](https://imagej.net/ij/disclaimer.html)
- [Analyzer.java：IntDen 与 RawIntDen 定义](https://imagej.net/ij/developer/source/ij/plugin/filter/Analyzer.java.html)
- [ProfilePlot.java：行列平均曲线](https://imagej.net/ij/developer/source/ij/gui/ProfilePlot.java.html)
- [Gel Analyzer 官方使用流程](https://imagej.net/ij/docs/menus/analyze.html#gels)
- [ImageJ.JS 官方说明](https://imagej.net/software/imagej-js)

来源核对日期：2026-10-15。

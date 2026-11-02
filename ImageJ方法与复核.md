# ImageJ 方法与复核

新图可选择 ImageJ1 兼容的范围缩放 8-bit、RGB 等权平均、矩形 / 椭圆和滚球背景。滚球允许 0–100 px；0 关闭。原始文件与像素保留，显示增强不改变定量。旧项目保留原方法，需主动切换或统一。

独立验证使用未修改的 ImageJ 1.54g BackgroundSubtracter 与 OvalRoi；72 组滚球配置、28,152 个像素及 81 种椭圆面积一致。参考值见 tests/fixtures/imagej-rolling-reference.json，生成器见 tests/ImageJOracle.java。Java 仅用于生成参考，不是应用依赖。

“ImageJ 方法”原始矩形面板仍报告未校准 Area / Mean / RawIntDen / IntDen 和行列曲线。高级分析的积分与背景设置另见灰度表。峰面积为均值曲线与可编辑线性基线之间的正值梯形积分，不能混同矩形积分单位，也不宣称包含完整 Java ImageJ 或全部 Gel Analyzer 交互工具。

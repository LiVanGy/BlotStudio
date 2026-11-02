# BlotStudio v0.5.0 Preview

免费离线 MIT 开源 WB 工作台，按参考软件可见的 1.1.11 前端科研工作流补齐功能，采用独立实现。

新增 ImageJ1 滚球、椭圆与峰面积、预处理记录、双参照比值、多因素与 ± 设计、凝胶 / 上样 / 孵育条件、课题目录恢复、统计映射、样式同步、重新上传、JPG、链接 SVG 和目录同步。修复 WebKit SVG 滤镜的灰度量化偏移；原始定量像素保留。完整测试改为临时生成模拟数据。

Windows x64 适合 Intel / AMD，ARM64 适合 ARM 设备；完整解压后打开 exe，需要 WebView2 Runtime，已带 .NET 运行时。Mac arm64 对应 Apple Silicon，x64 对应 Intel，需要 macOS 13+。Web offline 可直接打开 HTML。

测试及四个原生目标成功后才发布。Mac 为 ad-hoc 签名，未 Apple 公证；Windows 未商业签名。Windows 原生交互和 ARM64 实机仍需人工验收；未声明兼容参考软件内部项目格式。功能对照和证据见 docs/FEATURE-PARITY.md。

静态示例和真实实验文件不随包公开；临时生成的测试资料不进入发布包。

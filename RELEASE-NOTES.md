# BlotStudio v0.4.0 Preview

免费离线 WB 定量与自由组图；无账号、订阅和导出水印。源码采用 MIT 许可证。

## 下载

- **Windows x64**：普通 Intel / AMD 电脑。完整解压 Windows-x64 ZIP 后打开 `BlotStudio.exe`。
- **Windows ARM64**：Windows on ARM 电脑，使用 Windows-arm64 ZIP。
- **macOS arm64**：Apple Silicon；**macOS x64**：Intel。需要 macOS 13 或以上。
- **Web offline**：跨平台免安装版，解压后用 Chrome / Edge / Safari 打开 `BlotStudio.html`，Windows 也可双击 `Start-BlotStudio.cmd`。
- **source**：完整源码、测试、模拟图像和构建配置。

Windows 原生包自带 .NET 运行时，需要 Microsoft Edge WebView2 Runtime；未安装时可从微软官网下载，或直接使用 Web 离线版。微软组件按其各自许可证分发，应用源码的 MIT 许可证不替代组件许可证。

## 变化

同一分析与排版核心支持 macOS、Windows 和浏览器。Windows 新增原生保存对话框，区分成功、取消与失败；关闭前等待本地自动保存，失败时提示导出备份。Mac 版本号显示和 CPU 架构构建同步更新。

## 验证范围

GitHub Actions 运行不依赖未发布示例附件的测试子集，仅在该子集、Mac 编译及签名检查、Windows x64 / ARM64 编译全部通过后发布这些文件。CI 编译通过不等于真实窗口和原生保存面板的人工验收；Windows 原生交互尚待实机验证。ARM64 Windows 为交叉编译，尚未在 ARM64 设备运行。Mac 应用采用本地 ad-hoc 签名，未经过 Apple 公证；Windows 程序未做商业代码签名。

ImageJ 方法兼容层支持未校准矩形的 Area / Mean / RawIntDen / IntDen 与行列曲线，不包含完整 ImageJ Java 引擎、Gel Analyzer 人工峰面积或滚动球背景。本次公开发布暂不包含 examples 中的静态模拟 WB 附件；源码保留测试生成脚本。这些模拟图均不代表实验数据。详见方法和测试说明。

请定期使用“保存项目”导出 `.wbproj` 备份。各平台的自动保存空间独立，不能代替项目文件备份。

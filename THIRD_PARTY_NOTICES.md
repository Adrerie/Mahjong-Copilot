# 第三方模型与许可声明 / Third-Party Model Notices

Mahjong Copilot 是非商业、公开源码的 Android 麻将辅助项目。**免费开源使用不等于免除署名及 copyleft 义务**。这个文件记录确实使用的第三方来源；不将它们误标成项目自行训练的模型。

## Mahjong-YOLO — 模型与牌面数据来源

- 原作者 / Author: **Shin Zhang**（GitHub: [@nikmomo](https://github.com/nikmomo)）
- 项目 / Source: https://github.com/nikmomo/Mahjong-YOLO
- 数据集入口 / Dataset: https://www.kaggle.com/datasets/shinz114514/mahjong-hand-photos-taken-with-mobile-camera/data
- 仓库许可 / Repository license: **MIT**（原项目 `LICENSE`）。
- 本项目复用已训练的 Nano 检测牌模型，视权重取得方式直接使用上游 ONNX 或由合法取得的 `.pt` 导出 ONNX；无自行训练、无数据上传。
- 模型不是项目独创成果；保留原作者版权和许可证，公开发布时注明模型来源与使用的版本。

### 原项目 MIT 完整许可 / Original MIT License

```text
MIT License

Copyright (c) 2024 Shin Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Ultralytics YOLO11 — 模型架构、训练与导出

- 官方：https://github.com/ultralytics/ultralytics
- 官方许可：https://www.ultralytics.com/license
- 开源模型/框架许可：**AGPL-3.0**；完整原文：https://www.gnu.org/licenses/agpl-3.0.html
- 官方说明覆盖使用 Ultralytics 训练所产生的模型。**上游 Mahjong-YOLO 仓库标注 MIT 不能直接消除其所用 YOLO11 的 AGPL 条款**。
- 不商业化、完整开源时，可走开源许可路线而非购买商业许可，但发布包含该模型的 APK 时仍需履行对应源码/许可告知义务。
- 本仓库原代码继续保留 GPL-3.0。GNU AGPLv3 第13条允许与 GPLv3 组合，在组合分发时仍须满足对应部分的适用许可义务；不能简单宣称全体仅受 MIT 约束。

## Android 运行时：ONNX Runtime

- 运行时：https://github.com/microsoft/onnxruntime
- 上游许可：MIT（实际依赖版本需对应保留构建包中的三方 notices）。
- Android 设备侧使用 ONNX Runtime 原生推理；APK 不包含 Ultralytics Python 训练或转换程序。

## 已完成 vs 公开分发前的最后核对

- **已完成**：来源及版权署名、MIT 完整文本、AGPL/GPL 规则说明；本地模型转换、含 ONNX Debug APK 和 Lenovo 平板端侧推理有既有测试记录。
- **打包版公开发行前**：保留模型来源、对应开源许可和源码获取方式；实际 APK 的功能使用真机确认，不增加哈希验证或内部审批流程。
- 此文件不改变上游许可，也不自动授权与项目无关的第三方素材。

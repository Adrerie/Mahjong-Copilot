# Mahjong Copilot · 唯一 TODO（2026-10-12）

基线 `main`，开发 [PR #3](https://github.com/Adrerie/Mahjong-Copilot/pull/3)。版本暂维持 `1.1.0-beta.1`，验收后再同步 npm/Android 版本并递增 `versionCode`。原则见 [AGENTS.md](../AGENTS.md)。

## 目前代码已提交（不等于所有设备已验收）

- [x] 手动录牌、国标/四川13张进张与结构待牌、14张弃牌推荐及定缺兜底；国标8番起和待核时仅显示续打备选，不虚构摸牌概率。
- [x] 单一16:10国标截图的13+1固定槽导入、11种指纹拒识、逐槽修正、撤销。
- [x] **连续游戏截图**：比较人工确认的两张暗手，区分单次摸牌/弃牌/相同/无法判定；由用户选“新局面”或“继续本局”，只在14→13且明确勾选确认后将减少牌写入牌河。此功能仍需设备实测，不能还原其他玩家出牌/碰杠。
- [x] **Android 原生 YOLO 接口及人工审核 UI**：原生 ONNX Runtime、640 letterbox、37类raw xywh解码、外置NMS；本地相册候选标框、按位置/牌面手动核对、可补漏识别的手牌、只导入已确认的13/14张和可见牌河。不请求相机权限，不自动进行局面提交。
- [x] **离线导出工具** `scripts/export_android_yolo.py`：已有本地 .pt → 静态FP32 ONNX + 类别/尺寸/权重哈希 manifest；两个本地构建产物被 gitignore。模型二进制未随 PR 提交，普通 CI 构建默认显示“模型不可用”，不是内置模型版 APK。
- [x] 实拍批量评估脚本保留原输入权重哈希与防覆盖功能；有问题的候选框不自动转“牌河”。

## 现在需要完成并实测（按交付顺序）

- [ ] **P0 端侧模型打包**：在有 `mahjong-yolon-best.pt` 的开发机上执行下方导出，核对37类、输入 `[1,3,640,640]` / raw输出41通道、ONNX哈希；本地打包含模型的Debug APK。实测3-5张图片的PC与平板检测框位置、类别、置信度和耗时；处理 EXIF、相邻框误重、低置信误识。之后核对来源/权重/数据及 Ultralytics 相关分发条款，决定将ONNX以可再分发资产纳入开源发行版，**不得因为主仓库 GPL 就推断第三方权重许可**。
- [ ] **P0 Android真机体验闭环**：实拍按“本家手牌/公共已见牌/忽略”分类、漏牌补录、四张上限、红五拒认与撤销；游戏截图13→14、14→13、跳帧不猜、选中抬牌、多牌副露、牌墙人工修改；冷启动与切模式保存。录入失败必须可转回手动键盘。
- [ ] **P1 游戏游玩识别**：优先固定布局中游戏画面的手牌+自己打出的牌+可见牌河；从已保存截图导入扩展到 Android 主动授权 MediaProjection，使用前台服务、清晰的开始/停止提示、截屏单帧/低频比较和用户确认。优先桌内进程，不在没有证据时填充他家隐牌/时序。后续才做小悬浮提示，不绕过 `FLAG_SECURE`。避免上来同时做自动决策、多游戏皮肤通用模型和持续高频录像。
- [ ] **P1 补证实拍指标**：原开发记录5张实景图（单图手牌11/16、参数扫档13/16；两者评测口径不同），保留私有原图、标注、`review.csv`、哈希；仅据此调默认 `640/.22/.7`，不能称泛化准确率。评估目录不得写回仓库。
- [ ] **P1 正式签名APK**：在CI通过、授权模型资产的分发方式确定后，`main` 签名构建/版本校验→相同证书覆盖安装与记录保留→再打 Tag。若当前签名 CI 未包含模型，明确标注“不含YOLO”。
- [ ] **P2 规则补漏**：国标逐张8番起和（含未实现番种排除关系）、四川海底完整时序/地方变体/四人结算；先以高风险反例补测试，不扩成新引擎。
- [ ] **P2 现成策略对照，不训练**：国标可本地比对有授权的候选 `ZZmahjongBot`（缺ONNX导出/语料分发核实）与 `calculateBestDiscard`，核对动作mask、番种和同局面时延；四川仍保留现有策略。日麻、Qwen/RAG、自训练暂不列本轮。

## 最少命令（在自己的开发机）

```powershell
git switch feat/mcr-screenshot-import-20261012
git pull --ff-only origin feat/mcr-screenshot-import-20261012
npm ci
npm test
npm run typecheck
npm run build

# 仅有合法授权且已下载到本机的 YOLO 权重时运行；默认模型和元信息均不进 Git。
python -m pip install ultralytics onnx
python scripts/export_android_yolo.py --weights "D:\models\mahjong-yolon-best.pt"

# 必须在同一台机器、完成模型导出后构建，才能得到【含本地模型】Debug APK。
npx cap sync android
cd android
.\gradlew.bat assembleDebug
cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

在真机打开“真实牌桌照片 · 本机 YOLO”，确认状态 `ONNX · 37 classes` 才表示资产实际内置。依次测试识别、人工改牌、区域归属、补漏、分析、撤销、离线重开。若显示 `Model unavailable`，检查 `android/app/src/main/assets/mahjong_detector.onnx` 和 `mahjong_detector.json` 是否由本地导出并在构建前存在；旧APK不会自动获得新模型。

## 明确不做

不自训/微调/蒸馏，不接未经核实授权的权重，不自动发送照片，不把未核对的检测框输入规则引擎，不自动操作第三方麻将游戏；不创建额外阶段文档、复杂后端或数据平台。保留手动输入和规则建议作为永久回退。

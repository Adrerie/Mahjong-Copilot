# Mahjong Copilot · 唯一实施 TODO

> 功能优先级与长远取舍以根目录 [PRODUCT_DECISIONS.md](../PRODUCT_DECISIONS.md) 为准；开发纪律见 [AGENTS.md](../AGENTS.md)。这里**只存可执行任务、验收与测试记录**，不再重复完整产品论证或新增阶段文档。
> 稳定分支 `main`；当前工作位于 [PR #3](https://github.com/Adrerie/Mahjong-Copilot/pull/3)。版本仍为 `1.1.0-beta.1` / Android `versionCode 2`，不要未经签名/升级测试创建 Tag。

## 0. 已提交 ≠ 已在安卓真机通过

- [x] 手动国标/四川录牌、局面存储和撤销、13张进张/待牌、14张弃牌建议、四川定缺与国标8番提示保留。
- [x] 固定16:10游戏截图13+可选14槽、初始11种指纹与本地人工核验模板缓存；连续截图的手牌差分、新局面/继续本局及确认弃牌逻辑已提交。**尚非实时悬浮窗**。
- [x] 真实牌桌 Android 原生 ONNX 推理入口、全图候选框与手动区域/牌面修正、漏识别手牌补录，导入前校验。`scripts/evaluate_real_table.py` 和 `scripts/export_android_yolo.py` 已提交。
- [x] `scripts/check_android_device.ps1`：仅通过 ADB 收集单台设备版本、APK模型资产和签名覆盖安装的反馈；安装需要显式 `-Install`，不卸载、不清空数据。
- [x] 修复 `utils/entryEditing.ts` 中 Android/截图导入局面初始牌墙常量的缺失导入，原 [CI 失败记录](https://github.com/Adrerie/Mahjong-Copilot/actions/runs/38272706504) 显示这两个未定义符号；**需以最新 CI 确认修复通过**。
- [x] **2026-10-13 真机结果回填（Lenovo TB710FU，Android 16 / API 36 / arm64-v8a，2000×3200@400dpi）**：同签名 `adb install -r` 覆盖安装成功且未清除存档。装包 SHA256 `b6dc94293dd43b03c52af3dcffe5dc27e87ddf3c10dd247fe9e4744f95ea0157`，91.82 MiB，包内 `assets/mahjong_detector.onnx` 与 `.json` 成对存在，onnx 解包后 SHA-256 与清单 `model_sha256` 一致。App 内 `RealTableDetector.status()` 返回 `available: true · 37 classes`，界面显示 `ONNX · 37 classes`；首次调用（读资产+校验+建会话）往返 150 ms。5 张本机实拍经与 WebView 相同的预处理（长边≤1600、JPEG q0.82）走端侧原生推理：106–134 ms/张（中位 110 ms），候选框 46/21/33/37/12，同输入 PC 复算 42/23/34/36/14，最大偏差 4 框（JPEG 解码差异量级）。完整 UI 路径也走通一次：选择牌桌照片 → 系统相册取图 → 「检出 9 个候选 · 86 ms」→ 9 个框渲染、每框区域默认「未分配」、未分配时「确认导入」保持禁用。手动录牌与出牌辅助在真机可用：文本录牌 13→14 张、牌墙 83、和牌上下文控件正常，分析弹窗对成牌形状给出「花龙8番+门前清2番+幺九刻1番＝已达 8 番起和线（11番）」且不劝弃。测试前后 `localStorage`（`mahjong-copilot.entry.v1.guobiao/sichuan`）已完整还原，国标存档仍为用户原 13 张。`logcat -s AndroidRuntime:E Capacitor:D` 无异常；进程 TOTAL PSS 595 MB（其中 Graphics 264 MB）、Native Heap 113 MB。
- [ ] **仍未真机验证（不得当作已通过）**：连续截图导入的 13→14 / 14→13 人工纠错与撤销、漏检补录后真正写入局面、横竖屏与分屏、切后台恢复、断网重启、长时间温升与功耗、Release 证书覆盖安装的存档保留。模型缺失/损坏时的界面兜底目前只有代码与测试依据（`status()` 返回不可用原因、按钮隐藏、手动录入始终保留），未做真机破坏性验证。
- [x] **2026-10-13 补充真机结果（同上设备，经 WebView CDP 驱动 DOM，非手指实点）**：首页点「四川血战」可进入四川录入页，页面**同时**存在两个导入入口 `从四川血战截图导入手牌（实验功能）` 与 `真实牌桌照片 · 本机 YOLO（实验功能）`——此前截图导入只在 `mode === MCR` 下渲染，川麻没有入口。定缺控件「定缺 万/条/筒」可点：点「定缺 万」后 `aria-pressed` 由 false 变 true，再点回到 false。探针结束后存档未变（`mahjong-copilot.entry.v1.guobiao` 仍 `wallCount 83` 带用户原手牌、`.sichuan` 仍 `wallCount 55` 空手牌）。

## 1. 先处理测试与 APK（P0，小修可直接做）

- [ ] **最新 PR CI 必须全绿**：`npm test` → `typecheck` → Web build → Android Debug APK；失败按第一处报错修复，勿无关重构。Signed Release/Publish 在 PR 上跳过属正常。
- [ ] **Android 现有功能真机烟测（部分完成，见 §0 回填）**：已覆盖含模型的覆盖安装、模型加载、端侧推理与耗时、手动 13/14 张与出牌辅助、存档还原、崩溃日志。**仍待人工**：国标和四川切换与定缺、存档/撤销、截图纠错与 14→13 确认弃牌及跨帧未知、相册人工复核后写入局面、横竖屏/后台恢复/断网。核对版本、安装证书是否相容、旧数据是否保留；无设备不得勾选。
- [x] **YOLO 可用性**：本机 `mahjong-yolon-best.pt`（SHA-256 `5cb589075e18edbb0a40037b48fd88715e319d0f34e304e4dfc588da5d15f42e`）导出 `640 FP32` ONNX（37 类、41 个原始输出通道，SHA-256 `9ce26c999929cc724e9e8d55ba239d0fc975b9e175518be9a73be3ffb2cac625`）与 manifest，重打含模型的 Debug 包并在真机确认 `ONNX · 37 classes`；5 张实拍逐图对照 PC 检测框与耗时见 §0，偏差 ≤4 框、端侧 106–134 ms。这批样本的 EXIF 方向标签为空，方向不是 PC/端侧差异来源；重复框由同标签 IoU 0.7 抑制，与 PC 的跨类 NMS 在这 5 张上框数一致。
- [x] **上游是否已有可用 ONNX**：[Mahjong-YOLO](https://github.com/nikmomo/Mahjong-YOLO) 的 `models/nano/mahjong-yolon-best.onnx`（opset 11，10,611,880 B）与本机导出（opset 17）输入 `[1,3,640,640]`、输出 `[1,41,8400]`、37 类顺序完全相同，5 张实拍标签多重集逐图相同 → 上游 ONNX 兼容，无需为「能不能用」再转换。仍沿用本机导出件，因为它的 `source_sha256` 与清单、APK 内容已闭环可对账。
- [x] **端侧检测契约配对测试**：`npm test` 新增守卫，逐项对账导出脚本、`RealTableDetectorPlugin.java` 与 `evaluate_real_table.py` 的输入边长、类别数、41 通道、置信度 0.22、IoU 0.7、letterbox 灰边 114、NCHW `/255f`、`fp32`/`external` 声明、SHA 校验与「不得静默覆盖已有模型」，任一侧单独改动即失败（已用改阈值/改类别数的变异检查确认它会红）。
- [ ] **模型再分发授权（公开仓库/Release 的硬门槛，未完成）**：上游仓库与其 Kaggle 数据集均标 MIT，但训练与导出使用 Ultralytics YOLO11（AGPL-3.0），且本仓库是 GPL-3.0；把 `.onnx` 提交进公开仓库或放进公开 Release 前须单独确认这条义务（或改用不产生 AGPL 衍生物的授权路径）。当前 `.onnx`/`.json`/`*.pt` 仍由 `.gitignore` 挡住，只在本地 APK 内。
- [ ] **评测证据一致性**：5张原图、哈希、复核的 `review.csv` 和 `summary.json` 留本机。原有 `11/16` 与参数扫档 `13/16` 口径不同，不能声称泛化准确率；默认 `640/.22/.7` 只是起点。未经权重/数据/工具分发许可核查，ONNX 不进入公开 Release。

## 2. Android 游戏局内悬浮闭环（P1，**复杂任务只按计划实施**）

**交付 A：最小悬浮交互**
1. 完成 Android 原生权限与生命周期设计：用户点击“启动辅助”→请求悬浮窗权限、创建 MediaProjection 授权会话→启用 `mediaProjection` 前台服务并启动投影，常驻通知提供停止入口；中止、锁屏、旋转、权限取消均必须回收资源。按 Android 14+ 的前台服务类型与授权次序实现，不预先加入尚未使用的权限。
2. 首版悬浮窗只有悬浮球、**点一下识别**、显示牌名/进张/简短原因、暂停/关闭/去主界面纠错；不会自动点击游戏或遮挡关键操作。受保护画面拒绝识别，回退手录。
3. **验收**：用户离开本 App 后可在一款指定麻将游戏中触发识别，并正确停止投影；不自动截图存盘、不向网络上传图片；从权限拒绝/崩溃恢复，不显示过期推荐。

**交付 A 的落地范围（下一步照此实现，本轮不写代码）**
- 涉及文件：新增 `android/app/src/main/java/com/karislin/mahjong/AssistForegroundService.java`（投影会话 + 通知 + 停止入口）、`OverlayViewPlugin.java`（悬浮球与提示面板的 `Capacitor` 桥）、`android/app/src/main/AndroidManifest.xml`（仅 `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_MEDIA_PROJECTION`、`SYSTEM_ALERT_WINDOW`，Android 14+ 需 `foregroundServiceType="mediaProjection"`）、`utils/overlayBridge.ts`（Web 侧调用与降级）、`components/AssistOverlaySettings.tsx`（授权状态与开关入口）。
- 依赖顺序：清单权限与服务类型 → 授权会话生命周期（含拒绝/撤销/旋转/锁屏回收）→ 悬浮窗添加与移除 → 点击取帧复用现有 `RealTableDetector.detect()` 与截图识别 ROI 路径 → 提示渲染 → 停止与超时释放。前一步未过不接下一步。
- 最少测试：`tests/regression.ts` 补「同一帧重复点击不重复改局面」「服务未运行时桥返回明确不可用而不是猜牌」；`npm test && npm run typecheck && npm run build`；`npx cap sync android` + `assembleDebug`；真机核对授权弹窗顺序、通知停止后 `dumpsys media_projection` 无残留会话、`FLAG_SECURE` 界面拒绝识别并回退手录。
- 首个标定对象：平板上已安装 `com.poesysoul.mahjong13tiles_anzhuo`（13 Tiles），可作为第一款候选游戏，但**须用户确认要针对哪一款**后再固定布局假设。

**交付 B：游戏 UI 连续观察**
1. 首先提供**单一游戏配置**，保存相对 ROI（自己手牌、牌河、副露、轮到自己与否）；每个 ROI 可预览与重新标定。游戏 UI 以模板/色彩/必要时 OCR 为先，不默认常驻全屏 YOLO。
2. 点击式稳定后，才做画面变化触发的**低频**观察（候选 1–2 fps，仅作为测量起点）；仅在稳定状态改变时跑规则引擎，检查主线程阻塞、耗电、发热与悬浮窗卡顿。
3. 自己摸打、副露、牌河变化及自己回合判断需和已确认局面比对：保存**当前可信状态 + 前一稳定观察 + 少量必要事件**。同样13张但中途发生摸打、连跳多帧、游戏动画与错误重复框不能被伪造成单次事件。
4. **验收**：一整轮从摸牌至弃牌能正确更新自己暗手/牌河；他家可见副露不重复计牌；不确定操作标记待核，局面失效暂停建议；可局部修正和一键重新同步。先在单客户端通过，再考虑多布局配置。

**交付 B 的落地范围**
- 涉及文件：新增 `utils/gameLayoutRoi.ts`（相对 ROI 定义、序列化与校验）、`utils/roiTemplateMatch.ts`（模板/颜色匹配，复用 `utils/mcrScreenshot.ts` 的指纹与阈值口径）、`utils/frameDiff.ts`（变化检测与去抖）、`components/RoiCalibration.tsx`（标定与预览）；`utils/gameSnapshot.ts` 扩展为「当前可信状态 + 前一次稳定观察 + 有限已确认事件」。
- 依赖：交付 A 的可控取帧；配置只存相对坐标（0–1）与分辨率无关；OCR 仅在模板置信不足时按 ROI 局部启用。
- 最少测试：ROI 序列化往返、越界/重叠 ROI 拒绝、同一帧重复输入幂等、13→14 只记摸牌、14→13 仅在确认下记弃牌、跳帧与副露歧义必须落「待核」而不是猜；`compareHandSnapshots` 现有守卫继续跑通。
- 观测口径：每次识别记录帧耗时、匹配置信和是否触发规则引擎，用于评估发热与卡顿；不得把未确认框写入牌河。

## 3. 决策机与规则深度（P1/P2，**复杂任务计划**）

- [ ] **P1 合法动作接口**：按国标和四川分别输出可执行动作集（和牌、弃牌、吃碰杠等只在规则/回合已知时列出）；禁用缺关键状态的自动和牌宣称。国标结构听牌不保证8番，四川定缺与血战已胡玩家状态不能遗漏。补高风险规则测试。
- [ ] **P1 专用模型独立比较**：先保留 `calculateBestDiscard` 作为默认可运行基线；验证 `ZZmahjongBot` 等现成国标模型的许可证、输入特征/动作 mask 和本机性能，在相同局面及 Botzone 可复现对局中比较非法率（必须为0）、策略质量与 Android 延迟；不把原评分当模型真值、不未经归一校准叠加启发式分数。
- [ ] **P2 国标**：逐张待牌8番可和、番种排除与遗漏；攻守/长期收益仅在有可核验公开历史与收益时加入轻量估计。
- [ ] **P2 四川**：房间规则、剩余玩家血战状态、海底/查叫/花猪/完整多人结算及结算对照；当前倍率只做参考，不能充当净收益目标。
- [ ] **后备研究，不进当前产品依赖**：Qwen/RAG、多头自训练、ISMCTS/CVaR、日麻及通用游戏 AI。触发重新评估的条件已经记录在根目录产品决策档案。

**交付 C/D 的落地范围**
- 涉及文件：新增 `utils/legalActions.ts`（按玩法输出可执行动作集与「缺关键状态」标记）、`utils/strategyBaseline.ts`（把 `calculateBestDiscard` 包成默认策略接口，供与外部模型并列对照）；`utils/discardAnalyzer.ts`、`utils/mcrAnalyzer.ts`、`utils/sichuanAnalyzer.ts` 只在接口收敛时被动调整，不改规则口径。现成国标模型（如 `ZZmahjongBot`）的适配放独立目录 `utils/externalPolicy/`，与启发式评分器物理隔离，不共享分值。
- 依赖：合法动作集合必须先于任何模型接入；模型输入需要与 `GameState` 明确映射（含已见牌、副露、回合），输出必须经 `legalActions` 过滤后才可展示。
- 最少测试：非法动作率必须为 0（含缺状态时不宣称可和）；国标 8 番资格与结构成牌分离断言；四川定缺与已胡玩家状态断言；13 张只进出张、14 张才出弃牌建议；同一局面下「模型排序」与「启发式排序」分别落盘可比较，禁止未标定叠加；`npm test` 现有 44 项守卫全绿。
- 验收：相同牌局批量对照表（动作、番数口径、耗时、内存）在 PC 与真机各跑一遍并留本机；只有非法率为 0、策略质量与端侧时延都不劣于现有基线，才讨论替换默认策略。

## 4. 后续 Android 发布与功能优化（P2）

- [ ] 模型资产分发方案和实际授权检查；普通 PR CI 不含模型，README 和 APK 必须如实标注。正式签名 APK 只在 `main` 完成 build、`apksigner` 校验和安装/存档验收后发布；Tag/版本号一致，`versionCode` 递增。
- [ ] 完成同一签名证书覆盖安装的数据保留测试；**不同签名失败不能自动卸载**。性能记录至少包括首次启动、单张推理、后台/前台稳定性、长时间温升与退出资源回收。
- [ ] 在首个游戏客户端成功后，才考虑推荐牌位置高亮、简要对局复盘、区域配置导入导出、多游戏布局和危险牌提示。具体取舍回到 `PRODUCT_DECISIONS.md` 讨论，不立刻开发。

## 5. Windows PowerShell 测试命令（无需另写脚本流程）

```powershell
git fetch origin
git switch feat/mcr-screenshot-import-20261012
git pull --ff-only origin feat/mcr-screenshot-import-20261012
npm ci
npm test
npm run typecheck
npm run build

# 无本地权重时先打【不含YOLO】的基础 Debug APK
npx cap sync android
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

# 只检查设备和 APK；一台已授权 USB 调试设备，默认不安装
.\scripts\check_android_device.ps1

# 显式覆盖安装同签名 Debug（保留数据），签名冲突立即停下
.\scripts\check_android_device.ps1 -Install

# 手工操作 App 后，按需查看最近 AndroidRuntime/Capacitor 日志（仅本机）
.\scripts\check_android_device.ps1 -Logs

# 有本地合法权重时：先导出，再重做 build/sync/assembleDebug/install
python -m pip install ultralytics onnx
python scripts/export_android_yolo.py --weights "D:\models\mahjong-yolon-best.pt"
npx cap sync android
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
.\scripts\check_android_device.ps1 -Install
```

APK 内含 `assets/mahjong_detector.onnx` 与 `assets/mahjong_detector.json` 只表示**模型文件已打包**，不等于真机能加载/正确推理；必须在 App 内再确认状态并跑实际图片。签名冲突报错时不要使用 `adb uninstall` 掩盖问题。测试日志可能含隐私，人工检查后再共享。

### 5.1 端侧推理的可复现量法（本轮用过，不新增脚本）

`scripts/check_android_device.ps1` 必须存成**带 BOM 的 UTF-8**：脚本含中文提示，Windows PowerShell 5.1 会把无 BOM 文件按本机 ANSI 代码页解码，导致字符串里的引号被吃掉、整个脚本解析失败。运行前确认 `adb` 在 `PATH`（platform-tools 目录），且只连接一台已授权设备。

Debug 包的 WebView 可调试，因此模型状态与端侧推理可以不依赖人工点击就取到硬数据（结果只落本机，注意先备份再改 `localStorage`，测完还原）：

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$pid = (& $adb shell pidof com.karislin.mahjong).Trim()
& $adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
Invoke-WebRequest http://127.0.0.1:9222/json -UseBasicParsing   # 取 page 的 webSocketDebuggerUrl
# 在该 WebSocket 上 Runtime.evaluate：
#   await Capacitor.Plugins.RealTableDetector.status()          -> { available, classes }
#   await Capacitor.Plugins.RealTableDetector.detect({ image }) -> 框数与 elapsedMs
```

`detect()` 的 `image` 要与界面一致（长边≤1600、JPEG q0.82 的 data URL，上限 12 MB），否则与 PC 复算不可比。相册选图那条完整 UI 路径仍需在界面里点：程序化 `input.click()` 不会触发文件选择器（浏览器要求用户手势）。

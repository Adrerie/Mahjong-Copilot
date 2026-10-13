# Mahjong Copilot · 唯一实施 TODO

> 功能优先级与长远取舍以根目录 [PRODUCT_DECISIONS.md](../PRODUCT_DECISIONS.md) 为准；开发纪律见 [AGENTS.md](../AGENTS.md)。这里**只存可执行任务、验收与测试记录**，不再重复完整产品论证或新增阶段文档。
> 稳定分支 `main`；当前工作位于 [PR #3](https://github.com/Adrerie/Mahjong-Copilot/pull/3)。版本仍为 `1.1.0-beta.1` / Android `versionCode 2`，不要未经签名/升级测试创建 Tag。

## 0. 已提交 ≠ 已在安卓真机通过

- [x] 手动国标/四川录牌、局面存储和撤销、13张进张/待牌、14张弃牌建议、四川定缺与国标8番提示保留。
- [x] 固定16:10游戏截图13+可选14槽、初始11种指纹与本地人工核验模板缓存；连续截图的手牌差分、新局面/继续本局及确认弃牌逻辑已提交。**尚非实时悬浮窗**。
- [x] 真实牌桌 Android 原生 ONNX 推理入口、全图候选框与手动区域/牌面修正、漏识别手牌补录，导入前校验。`scripts/evaluate_real_table.py` 和 `scripts/export_android_yolo.py` 已提交。
- [x] `scripts/check_android_device.ps1`：仅通过 ADB 收集单台设备版本、APK模型资产和签名覆盖安装的反馈；安装需要显式 `-Install`，不卸载、不清空数据。
- [x] 修复 `utils/entryEditing.ts` 中 Android/截图导入局面初始牌墙常量的缺失导入，原 [CI 失败记录](https://github.com/Adrerie/Mahjong-Copilot/actions/runs/38272706504) 显示这两个未定义符号；**需以最新 CI 确认修复通过**。
- [ ] **真实设备结果待回填**：Android 版本/型号、APK SHA256、是否含 ONNX、是否成功安装、性能与崩溃、截图/照片实测。此前独立验收不能代替本批新包的真机结论。

## 1. 先处理测试与 APK（P0，小修可直接做）

- [ ] **最新 PR CI 必须全绿**：`npm test` → `typecheck` → Web build → Android Debug APK；失败按第一处报错修复，勿无关重构。Signed Release/Publish 在 PR 上跳过属正常。
- [ ] **Android 现有功能真机烟测**：测试手动13/14张、国标和四川切换与定缺、存档/撤销、截图纠错、14→13用户确认弃牌及跨帧未知、相册人工复核、横竖屏/后台恢复/断网。核对版本、安装证书是否相容、旧数据是否保留；无设备不得勾选。
- [ ] **YOLO 可用性**：已有授权 .pt 在本机转换 `640 FP32` ONNX（37类、41个原始输出通道）与 SHA256 manifest，重新打有模型的 Debug 包；在 Android UI 看到 `ONNX · 37 classes` 后，用3–5张本地实拍逐图对照 PC 检测框、类别与耗时，处理 EXIF 方向、重复框和漏检。
- [ ] **评测证据一致性**：5张原图、哈希、复核的 `review.csv` 和 `summary.json` 留本机。原有 `11/16` 与参数扫档 `13/16` 口径不同，不能声称泛化准确率；默认 `640/.22/.7` 只是起点。未经权重/数据/工具分发许可核查，ONNX 不进入公开 Release。

## 2. Android 游戏局内悬浮闭环（P1，**复杂任务只按计划实施**）

**交付 A：最小悬浮交互**
1. 完成 Android 原生权限与生命周期设计：用户点击“启动辅助”→请求悬浮窗权限、创建 MediaProjection 授权会话→启用 `mediaProjection` 前台服务并启动投影，常驻通知提供停止入口；中止、锁屏、旋转、权限取消均必须回收资源。按 Android 14+ 的前台服务类型与授权次序实现，不预先加入尚未使用的权限。
2. 首版悬浮窗只有悬浮球、**点一下识别**、显示牌名/进张/简短原因、暂停/关闭/去主界面纠错；不会自动点击游戏或遮挡关键操作。受保护画面拒绝识别，回退手录。
3. **验收**：用户离开本 App 后可在一款指定麻将游戏中触发识别，并正确停止投影；不自动截图存盘、不向网络上传图片；从权限拒绝/崩溃恢复，不显示过期推荐。

**交付 B：游戏 UI 连续观察**
1. 首先提供**单一游戏配置**，保存相对 ROI（自己手牌、牌河、副露、轮到自己与否）；每个 ROI 可预览与重新标定。游戏 UI 以模板/色彩/必要时 OCR 为先，不默认常驻全屏 YOLO。
2. 点击式稳定后，才做画面变化触发的**低频**观察（候选 1–2 fps，仅作为测量起点）；仅在稳定状态改变时跑规则引擎，检查主线程阻塞、耗电、发热与悬浮窗卡顿。
3. 自己摸打、副露、牌河变化及自己回合判断需和已确认局面比对：保存**当前可信状态 + 前一稳定观察 + 少量必要事件**。同样13张但中途发生摸打、连跳多帧、游戏动画与错误重复框不能被伪造成单次事件。
4. **验收**：一整轮从摸牌至弃牌能正确更新自己暗手/牌河；他家可见副露不重复计牌；不确定操作标记待核，局面失效暂停建议；可局部修正和一键重新同步。先在单客户端通过，再考虑多布局配置。

## 3. 决策机与规则深度（P1/P2，**复杂任务计划**）

- [ ] **P1 合法动作接口**：按国标和四川分别输出可执行动作集（和牌、弃牌、吃碰杠等只在规则/回合已知时列出）；禁用缺关键状态的自动和牌宣称。国标结构听牌不保证8番，四川定缺与血战已胡玩家状态不能遗漏。补高风险规则测试。
- [ ] **P1 专用模型独立比较**：先保留 `calculateBestDiscard` 作为默认可运行基线；验证 `ZZmahjongBot` 等现成国标模型的许可证、输入特征/动作 mask 和本机性能，在相同局面及 Botzone 可复现对局中比较非法率（必须为0）、策略质量与 Android 延迟；不把原评分当模型真值、不未经归一校准叠加启发式分数。
- [ ] **P2 国标**：逐张待牌8番可和、番种排除与遗漏；攻守/长期收益仅在有可核验公开历史与收益时加入轻量估计。
- [ ] **P2 四川**：房间规则、剩余玩家血战状态、海底/查叫/花猪/完整多人结算及结算对照；当前倍率只做参考，不能充当净收益目标。
- [ ] **后备研究，不进当前产品依赖**：Qwen/RAG、多头自训练、ISMCTS/CVaR、日麻及通用游戏 AI。触发重新评估的条件已经记录在根目录产品决策档案。

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

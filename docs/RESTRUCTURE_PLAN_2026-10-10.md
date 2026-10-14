# Mahjong Copilot · 唯一 TODO（精简执行版）

产品目标、论文和暂缓方案归档于 [PRODUCT_DECISIONS.md](../PRODUCT_DECISIONS.md)；[AGENTS.md](../AGENTS.md) 只管执行约束；第三方模型许可及作者致谢见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。不再追加第二份路线图。

稳定 `main`，开发 [PR #3](https://github.com/Adrerie/Mahjong-Copilot/pull/3)，版本 `1.1.0-beta.1`（Android `versionCode 2`）。先保证已有功能可实测，复杂功能按下列顺序推进。

## 已完成及证据（代码提交不等于所有场景实测）

- [x] 国标、四川的手动录入和可解释策略：13张进张、14张弃牌建议、四川定缺；截图固定16:10槽位、人工修正、续局/新局、撤销；实拍 ONNX 识别框+人工区域/牌面分配，手动兜底。
- [x] **Lenovo TB710FU 平板本机测试记录（2026-10-13）**：Android 16/API36，arm64；同签名 `adb install -r` 成功，保存的数据未丢；包含 ONNX 的本地 Debug APK **91.82 MiB**（SHA256 `b6dc94293dd43b03c52af3dcffe5dc27e87ddf3c10dd247fe9e4744f95ea0157`）；模型 `ONNX · 37 classes` 可加载。模型 SHA256 `9ce26c999929cc724e9e8d55ba239d0fc975b9e175518be9a73be3ffb2cac625`；5张实拍 106–134 ms/张（中位110 ms），与PC输出候选数量存在每图最多4框差异；一次相册9框显示完成、但**未完成最后确认导入**。一次手录+分析通过，`logcat` 未见异常。RAM PSS约595 MB，继续监控。
- [x] 上游 [Mahjong-YOLO](https://github.com/nikmomo/Mahjong-YOLO) 自带 37 类 ONNX 与当前 `[1,3,640,640]`/ `[1,41,8400]` 契约兼容，故**无需重复转换来证明可用性**。需要版本/哈希对账时仍可用 `scripts/export_android_yolo.py` 从既有 .pt 导出；不覆盖已有 `.onnx`。
- [x] 续局截图导入已从硬编码国标入口改用 `planImportedState`，四川可保留定缺和牌墙；新增**换牌后清空过期和牌事件**的回归检查（等待此批 CI 核验）。
- [x] **开源许可路线与署名已成文**：上游 Shin Zhang/@nikmomo 的 MIT 版权声明、Ultralytics YOLO11 的 AGPL-3.0 和 GPLv3 组合说明已收录 `THIRD_PARTY_NOTICES.md`，不需要商业许可；但公开分发内置模型仍必须提供对应源码/告知，并确保实际模型来源一致。非商业不意味着仅署名就已合规。
- [x] `scripts/check_android_device.ps1` 可在单台已授权 ADB 设备上核对 APK、模型资产、**APK 内模型哈希/37类映射**，仅 `-Install` 时覆盖安装，不卸载或清存档。
- [ ] 实拍5张原图、复核表/误差统计均保留开发机，`11/16` 与 `13/16` 是不同测量口径，不能宣传成泛化准确率。

## P0 · 立即补齐当前 Android 功能实测

- [ ] **修复后 CI 全绿**：npm 44项原守卫+新回归、TypeScript、Web、Python 语法、Android Debug；故障只修具体错误。普通 CI 的 Debug APK **不包含本地被 gitignore 的 ONNX**，下载普通构建时请检查说明，不要假称它是内置模型版本。
- [ ] **实拍完整链路**（真机触屏优先）：含 ONNX APK 打开相册→选照片→每个候选框指定本家/公开牌河/忽略并纠正牌面→补漏→确认导入13或14张→显示正确分析→撤销回原局面；测试4张上限、误框冲突与拒识。保留实测屏录/日志于本机，不上传私有图。
- [ ] **游戏截图完整链路**：国标和四川分别验证13→14、14→13且明确确认弃牌、同样13张但多步变化不猜、错误槽位人工改牌、定缺保存、撤销与重启存档。
- [ ] **设备稳定性**：横竖屏/后台切换/断网/冷启动/长时间连续推理；记录单帧耗时、PSS峰值、发热/崩溃及用户界面可操作性。前述真机/CDP只证明有限步骤，未经手指确认的页面交互不算手动通过。
- [ ] **APK 来源**：分清本机内置模型 APK、普通 GitHub Actions 无模型 APK 和未来正式签名 APK。公开含模型版本须随附第三方 notices、模型哈希、源码获取入口与 GPL/AGPL 合规材料；签名一致和存档保留测试通过后才发布。**不因非商用自行忽略义务，也不再把付费商业许可当作主线前置条件。**

## P1 · 游戏内实时悬浮助手（复杂任务：逐段交付）

1. **第一段：悬浮球 + 授权截图**。安卓用户主动授权 MediaProjection，正确的 Android 14+ mediaProjection 前台服务/通知、悬浮窗权限；首版只需点悬浮球取一帧、识别并显示简单候选建议、暂停/停止/拒绝恢复。不绕过 `FLAG_SECURE`、不点击游戏、不上传画面。**验收**：切到一款指定游戏后点球看到建议；停下后系统投影会话完全结束，无残留窗口/旧推荐。
2. **第二段：手牌 ROI + 局部校正**。为首款游戏保存相对 ROI（手牌、可见牌河、副露、本人回合），模板匹配优先，必要时区域 OCR；实拍 YOLO 不作为每帧全屏引擎。**验收**：能在布局稳定的游戏截图中校准全部34种牌面候选，未知低置信显示待核，可一键重同步。
3. **第三段：低频自动刷新与局面维护**。在点击式稳定后做画面变化触发的低频观察，按实际耗时与发热调节；只存当前可信状态、前一稳定观察及少量已确认事件。**验收**：真实一轮摸打/牌河变化正确，副露不双计；跳帧、动画或关键区域遮挡时不生成虚构操作，暂停建议或请求人工确认。
4. **边界**：先验收一款 Android 游戏；不能预先为多种客户端、通用布局 AI 或复杂事件总线搭架构。

## P2 · 规则/策略与发布（不阻碍 P0/P1）

- [ ] 国标逐张8番起和及番种排除关系；四川缺门、血战已胡玩家、海底/查叫/花猪及四人净结算，先补反例测试，不重建规则引擎。
- [ ] 现成国标策略模型**独立评测**：规则引擎先出合法动作 mask，现有 `calculateBestDiscard` 保持默认回退；比较同一局面、Botzone 对局、动作合法性、时延及真实收益。不要训练新模型，也不要未经标定混合两个评分函数。
- [ ] 最终发布：主线 CI、许可与对应源码告知、模型/签名哈希、相同证书覆盖安装保留存档；再同步 npm / Android 版本、递增 versionCode 和创建 Tag。
- **移出本轮实现**：Qwen/RAG、自训练/蒸馏、多头网络、完整 ISMCTS/CVaR、日麻、通用多游戏 UI Agent、全量复盘平台；备选仍记录在根目录决策档案。

## 可复制给 Codex / Windows PowerShell 的命令

```powershell
git fetch origin
git switch feat/mcr-screenshot-import-20261012
git pull --ff-only origin feat/mcr-screenshot-import-20261012
git status --short

npm ci
npm test
npm run typecheck
npm run build
python -m py_compile scripts/evaluate_real_table.py scripts/export_android_yolo.py

# 要验证“内置模型”必须让这两个本地文件存在，不能仅下载 GitHub 的普通 CI APK：
Get-Item android/app/src/main/assets/mahjong_detector.onnx
Get-Item android/app/src/main/assets/mahjong_detector.json
# 如果原本没有这两个文件，且本地 .pt 同目录并无待保留的 ONNX，才执行：
# python -m pip install ultralytics onnx
# python scripts/export_android_yolo.py --weights "D:\models\mahjong-yolon-best.pt"

npx cap sync android
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

# 先只读检查：设备/包体/ONNX 资源哈希和37类，失败不安装
.\scripts\check_android_device.ps1
# 已核对签名相容才安装，保留原本数据：
.\scripts\check_android_device.ps1 -Install
# 测试后选用：最近运行异常，日志不自动上传：
.\scripts\check_android_device.ps1 -Logs
```

实际设备的每个测试项目记录 **通过/失败/未测**、截图或日志摘要、使用的 APK SHA256 和设备型号。复杂问题仅更新本文件，简单可复现 Bug 才直接修改；保持 PR 打开，未经实际证据不提前勾选。

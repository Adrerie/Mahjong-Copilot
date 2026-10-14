# Mahjong Copilot · 唯一 TODO

产品功能取舍保留在 [PRODUCT_DECISIONS.md](../PRODUCT_DECISIONS.md)，开发规范见 [AGENTS.md](../AGENTS.md)。目前继续在 [PR #3](https://github.com/Adrerie/Mahjong-Copilot/pull/3) 工作；不要另建计划、验收矩阵或门控流程。

## 已有成果

- 手动录牌、国标与四川出牌/进张建议、定缺、撤销和局面保存已存在。
- 游戏截图支持固定布局识牌、用户修正、新局/续局；已修复四川导入、换牌后过期和牌上下文、修改牌面时旧弃牌确认未重置的问题。
- 安卓真实牌桌照片可使用本地 YOLO ONNX 识别。新增照片上直接点击候选框选择手牌/牌河、底部13/14张位置快捷选取、就地错误提示。已有 Lenovo TB710FU 真机测试记录：含模型的本地 Debug APK 可加载，5张照片推理约106–134ms/张；**照片完整确认导入、撤销和游戏局内悬浮识别仍未验收**。
- 上游 [Mahjong-YOLO](https://github.com/nikmomo/Mahjong-YOLO) 已有可用 ONNX。保留 `mahjong_detector.onnx` 和用于牌名映射的 `mahjong_detector.json` 即可打包，不再做哈希或复杂模型清单校验。模型二进制不入 Git，Android CI 自动从上游获取 ONNX 并打包；本机也能用 `--onnx` 或 `--weights` 打包。
- 原作者和开源许可证见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。开源使用不以购买商业授权为前置；公开分发保留对应开源声明和源码入口。

## 下一步直接做的工作

- [ ] **完善现有功能真机操作**：选取照片→直接点框快速分配→改错牌/补牌→导入→分析→撤销；国标和四川分别试截图13→14、14→13、重启与存档。出现 Bug 直接修；不要求建立新测试框架。
- [ ] **实现 Android 游戏内悬浮识别**：由用户授权 MediaProjection，放置轻量悬浮球；在游戏中点击球截取画面，调用现有识别和建议逻辑。先让当前平板上的一个游戏能实际使用，不必一次完成通用布局、多游戏适配与后台自动追踪。
- [ ] **提升游戏识别**：根据真实截图调整手牌区域/模板，按需要维护牌河和副露。局面变化明显时更新提示，不确定时简单提示手动修正。避免高频全屏 YOLO。
- [ ] **优化策略**：优先完善国标8番与四川规则的明显错误；可测试现成策略模型，但不自训，不引入未经验证的复杂融合函数。已有出牌建议保持可用。
- [ ] **公开 APK**：本地模型打包体验确认后，保留 MIT/AGPL/GPL 的必要版权告知及源码获取地址，使用现有签名工作流发布；不增加哈希检验或审批链。

## 明确不做

不做文件哈希校验、参数多处交叉对账、源码字符串测试、逐关阶段门槛、独立验证系统、完整 Event Sourcing、数据库服务、通用游戏视觉 Agent、全量自博弈训练、多模型串联、复杂复盘大盘。这些不是目前的用户功能。

## Windows PowerShell：直接构建并在设备上操作

```powershell
git fetch origin
git switch feat/mcr-screenshot-import-20261012
git pull --ff-only origin feat/mcr-screenshot-import-20261012
npm ci
npm test
npm run typecheck
npm run build

# 在本机准备 ONNX 和对应牌名 JSON 后运行：
# android/app/src/main/assets/mahjong_detector.onnx
# android/app/src/main/assets/mahjong_detector.json
# 已有 ONNX 时直接打包（无需 PyTorch）：
# python -m pip install onnx
# 从上游下载 ONNX，避免在本机转换 PT
Invoke-WebRequest "https://raw.githubusercontent.com/nikmomo/Mahjong-YOLO/main/models/nano/mahjong-yolon-best.onnx" -OutFile "$env:TEMP\mahjong-yolon-best.onnx"
python scripts/export_android_yolo.py --onnx "$env:TEMP\mahjong-yolon-best.onnx"
# 只有 .pt 才用 --weights 转换：
# python scripts/export_android_yolo.py --weights "D:\models\mahjong-yolon-best.pt"

npx cap sync android
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

.\scripts\check_android_device.ps1 -Install
# 遇到故障才看日志：
.\scripts\check_android_device.ps1 -Logs
```

设备安装后直接打开应用试照片识别、导入、分析、撤销；记录能否完成及出现的具体问题。**不要把构建成功或代码测试成功当作悬浮窗已可用。**

# Mahjong Copilot · AGENTS.md

## 交付原则

- 稳定基线 `main`；在当前功能分支和 PR 内完成相关改动，CI/真机验证后再合并。不要直接推送 `main`、改写历史或创建发行 Tag。只维护 [单一 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)，不新建分阶段路线图或训练基础设施。
- 保留 React/TypeScript/Vite/Capacitor、**手动录牌**、已有 `analyzeGame`、`calculateBestDiscard` 作为随时可用的核心功能。任何视觉/策略模型均为可关闭、可纠错的辅助入口；无模型时必须仍能录牌、算牌和出牌推荐。
- 国标与四川分离：13张展示待牌/进张，14张合法动作才推荐弃牌；国标结构成牌不等于满足8番；合法和牌不劝弃；四川定缺硬约束，倍率不是四人净结算。不得凭静态画面推断历史或虚构概率、胜率。

## 识别链路（按可观测事实）

- **国标游戏截图**：当前适配单一16:10布局、13+可选14张、11种指纹，必须逐槽核验；失败就手录。连续截图仅比较用户确认的手牌多重集，13→14可识别新增摸牌，14→13只在用户明确确认时把减少的牌记入已见牌河；跨帧、碰杠、其他玩家行为一律不猜。可选“新局面”或“继续本局”，都可撤销。
- **真实牌桌相册**：Android `RealTableDetector` 原生桥通过 ONNX Runtime 运行静态640 RGB FP32模型、原生NMS；候选框默认 `unassigned`，人工分别指定自己手牌、已确认牌河或忽略，并核验34种合法牌面。错/漏框人工修补；确认前不写局面，确认后可撤销。未确认的散牌、他人牌、背面牌不得冒充弃牌；单帧牌河不具备时间顺序。
- **模型本地打包**：`scripts/export_android_yolo.py --weights <local.pt>` 导出 `android/app/src/main/assets/mahjong_detector.onnx` 和带SHA-256、37类映射的 `mahjong_detector.json`；资产默认 gitignore，不存在或校验失败时显示模型不可用、保留手动输入。不得宣称普通 CI Debug APK 已包含未提供的模型。只有拿到分发授权并明确交付方式后才放进 Release；不要上传私有照片、签名文件或密钥。
- 下一步**游戏游玩识别**优先做明确授权的 Android MediaProjection 截屏 → 本地帧检测/前后变化 → 人工确认的局面更新 → 轻量悬浮提示；实现系统权限/前台服务、停止控制、帧率与功耗限制，尊重 `FLAG_SECURE`，不绕过受保护画面、不代用户控制游戏。游戏布局优先固定区域，必要时才使用模型。
- 模型导出和推理的预处理/输出坐标/NMS 必须有配对测试；实景阈值 `640/.22/.7` 是先前小样本起点而不是泛化结论。模型权重、源代码、数据集和第三方工具的许可分别核实；开源本身不自动授予分发权。

## 其余原 TODO 的边界

- 无需自行训练、蒸馏、搭建自博弈：国标现成策略可在 Botzone 对比，但只有合法动作mask/国标8番核验/ Android 时延测试通过才考虑采用。四川保留当前规则评分与定缺兜底，日麻和 Qwen/RAG 不抢本轮优先级。
- 保留国标未全覆盖的番种及8番逐张核验、四川海底时序/完整多人结算、签名 Release 安装升级与数据保留为明确未完成项；逐项实现，不把 TODO 写成已交付功能。

## 最小验收

`npm test && npm run typecheck && npm run build`、`python -m py_compile scripts/evaluate_real_table.py scripts/export_android_yolo.py`、GitHub Web/Android Debug CI。模型存在时额外核对导出形状、哈希、PC/Android同图识别、真实设备耗时和内存；截图连续导入覆盖13→14/14→13/跳帧/撤销。使用过真实设备才记录真机通过。签名发布前检验版本号、versionCode、同证书覆盖安装与本地记录保留，密钥永不进入仓库或日志。

# Mahjong Copilot · AGENTS.md

## 工作原则

`main` 是稳定版；只在功能分支提交并经 PR 验证，不触碰签名密钥。保持 React/TypeScript/Vite/Capacitor、现有录牌与规则引擎；**只维护 [单一 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)**，一批完成相关功能，不建新阶段/框架/冗长评审。预研未验证不得标记已实现。

## 输入与规则

- 国标：13张等效牌分析向听/结构待牌，14张才推荐弃牌；实际起和须满足8番。吃碰杠固定，未知和牌上下文不补番。
- 四川：暂按 Hi8 示例口径；定缺和事件为硬约束。没有完整四人支付及血战过程前，不把参考倍率当成可训练的真实终局净收益。
- 游戏截图：现有固定16:10实验入口，支持13张+可选摸入牌、未知牌人工修正；确认后一次性替换局面、支持撤销。不要声称已有完整34种自动识牌。
- 现实照片：**先整图检测本人手牌和可见牌池等候选，再人工核对牌面/归属**。散牌、他家牌、背面/遮挡牌不能自动算作本人牌河；静态图片不能推断弃牌顺序和未见牌。先用本地3张照片执行 `scripts/evaluate_real_table.py` 批量评估，再决定是否引入ONNX Android运行时；不得将照片/密钥上传仓库。
- Android悬浮窗、MediaProjection、牌河时序识别与策略模型当前均未交付；不绕过 `FLAG_SECURE`，只读辅助。

## 策略与实验

- 当前 `calculateBestDiscard` **仅作为独立基线和回退**，不能直接作为新策略网络的监督真值。先用现成国标权重、合法动作掩码、对局终局收益及轻量势能/风险函数做可重复对照；训练时 Actor 只使用玩家可见信息。
- 国标可在 [Botzone Chinese-Standard-Mahjong](https://www.botzone.org.cn/game/Chinese-Standard-Mahjong) 做公开规则完整对局评测，也须在 Android 本地复核同牌局的动作、速度、内存。线上排名、单局胜负和端侧推理性能不能相互替代。四川先补可信结算/对局环境，再训练独立收益策略；暂不引入日麻。
- Qwen量化、RAG、LoRA只作候选实验；若专用麻将策略网络更优则不引入。视觉模型与策略网络分别验证；不可伪造识别准确率、胜率、收益或模型显存。

## 最少验证

规则/前端改动：`npm test && npm run typecheck && npm run build`，核对现有Web/Android Actions。3张实拍每张保留检测框、JSON、人工漏检/误检记录；只有现场运行过才能称Android实测。版本发布同步npm/锁文件、Android versionName/versionCode，CI签名Secrets不得出现在日志或PR。

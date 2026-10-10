# Mahjong Copilot · AGENTS.md

## 当前阶段与交接

- 当前授权：**P1 基础修复 + P1 交互余项 + GitHub Actions 验证/Debug APK 打包**。先读 [精简施工计划](docs/RESTRUCTURE_PLAN_2026-10-10.md) 和 [P0 测试](tests/regression.ts)。历史问题仅参考 [ISSUE_AUDIT](docs/ISSUE_AUDIT_2026-10-10.md)、[旧修补计划](docs/REPAIR_PLAN.md)。
- 用户已授权在工作分支提交；**禁止自行合并/直接修改 main、发布签名 APK 或自动进入 P2/P3**。任何本地操作先 `git status --short`，保留未提交改动，禁止 `reset --hard`、`git clean -fd`、强制覆盖。
- 2026-10-10 P1 基础修复已在 `feat/p1-foundation-ci-20261010` 提交：`AnalysisResult.status` 显式区分无效、不完整、死叫与结构成牌待核；无效输入 `shanten=null`；死叫 `isReady=false`；UI 不显示经验成功率；已增加相应回归。**不要重复设计状态体系或反向恢复旧断言**。
- P1 交互余项已在同一分支完成：文本牌串录入（唯一新增模块 `utils/entryEditing.ts`）、一步撤销、按玩法局面恢复、添加失败提示与吃牌数量校验、键盘内分析入口与遮挡滚动、副露显式 `×` 删除。390×844 已实测，记录见 [精简施工计划](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

## 项目边界

- 保留 React 19 + TypeScript + Vite + Capacitor 结构与当前深蓝／霓虹配色、拟物麻将牌和圆角视觉。只优化录入、可用性、结果展示和移动端细节；不整体换肤。
- 不引入 AI/OCR/YOLO、云端状态、数据库、服务器、Redux/全局状态机、麻将规则 DSL、插件体系、跨语言运行时或“一次补完 81 番”的大工程。
- 已有 `utils/mahjongLogic.ts` 与现有组件即可；需要时新增**一个**纯牌串解析工具，不增加独立输入框架或复杂撤销记录。
- 输入编辑可以容纳1–14张等效牌；**分析**只接受合法13/14等效张数，不应强迫用户必须一次录满。牌数=`hand.length+melds.length*3`；杠实体4张；手牌＋副露＋牌河同牌至多4张。失败操作不得部分污染状态。
- 区分非法、不完整、成牌结构、可用听牌、死叫、规则计番与倍率/结算。死叫保留待牌明细但 `isReady=false`；无效与不完整不显示数字向听。没有证据不得显示“90%/95%成功率”。
- 国标目前不覆盖81番及全部自摸/抢杠/门风上下文；四川/重庆规则未统一。不得把参考番数当正式结算，`33344466699977s` 的倍率须由有出处的规则定义，不默认16倍。
- 禁止用 `any`、`as any`、`@ts-ignore` 掩盖新增类型问题。

## 测试与工作流

- **25项P0/P1守卫**与**18项已知问题行为快照**用途不同：守卫表达应永远成立的正确行为；`defect(...)` 故意锁定旧输出，修某缺陷时必须把它改为正确断言，而不是仅更新旧快照值。尚未确定规则来源的番数只是观测行为，不得宣称“已证实规则错误”。
- 运行 `npm ci`、`npm test`、`npm run typecheck`、`npm run build`；更新UI时测390×844、刷新、撤销、键盘打开时分析入口与无障碍。未经实际运行，不得声称通过。
- [.github/workflows/verify-and-package.yml](.github/workflows/verify-and-package.yml) 在指定分支、PR、手动触发时验证 Web，并尝试构建 **Android Debug APK**；上传 `web-dist` 与 `mahjong-copilot-debug-apk`。Debug APK 不是发布签名包，CI 成功不能替代安卓真机/离线验证；工作流失败优先分析日志、最小修复。
- 每批报告改动、测试证据、尚未完成及精简动作；禁止为了“架构完整”创造闲置代码、依赖、配置或新一轮重复计划。完成 P1 后删除已完成待办与多余设计，不影响 P2/P3 的核心牌例。

## 外部参考与许可

- 国标对照：`ailab-pku/PyMahjongGB`、`zheng-fan/GB-Mahjong`（MIT，需保留上游相应许可）。
- 向听参考：`MahjongRepository/mahjong`（MIT，日麻规则不可直接套用）；川麻选叫参考：`luxinghong/sichuan-mahjong-analyzer`（LICENSE/README 权利表述矛盾，未澄清只研读）。
- UI 参考：`PaiForge/mahjong-react-ui`（代码声明 MIT，牌图素材许可另审）；流程参考：`alanfeiyuchang/majiang_calculator`（仅个人使用，**禁止复制代码、测试、图片、模型**）。

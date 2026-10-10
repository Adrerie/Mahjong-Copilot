# Mahjong Copilot · 精简重组与 P1 交接计划
2026-10-10 · 当前工作分支：`feat/p1-foundation-ci-20261010`。

> **先读 [AGENTS.md](../AGENTS.md)。** 本文只保留尚待执行的具体操作、验证牌例和明确限制。P0 旧排查详见 [ISSUE_AUDIT](ISSUE_AUDIT_2026-10-10.md) 和 [REPAIR_PLAN](REPAIR_PLAN.md)。当前阶段只执行 P1，不提前解决川麻/国标全部计番。

## 阶段状态与已经落地的内容

| 阶段 | 状态 | 下一步 |
|---|---|---|
| P0 代码基线 | 已完成 | 17项正确行为守卫 + 18项既有问题行为快照；旧审计归档。DeepSeek 报告 `npm ci/test/typecheck/build` 通过，本轮修改仍需 CI 独立验证 |
| **P1 结果状态与误导性展示** | **本分支已修改，待 CI 验证** | `AnalysisResult.status` 区分 `invalid/incomplete/notReady/ready/deadWait/completeShapeScoreUnverified`；无效输入向听置 null，死叫 isReady=false，UI 删除伪成功率百分比，并更新守卫 |
| **P1 录牌与手机交互** | **本分支已完成，390×844 已实测** | 见下方「P1 已完成」；待本地提交与 CI |
| Actions 与打包 | 已添加工作流，待实际运行验证 | `web-dist` 和 **仅供测试的 Android Debug APK**，不做 Release 签名、发布或 Play Store |
| P2 四川规则 / P3 国标计番 / P4 其他 | 未开始 | 本次禁止提前展开 |

此处已有五类变更：`types.ts`、`utils/mahjongLogic.ts`、`components/AnalysisResultModal.tsx`、`tests/regression.ts`、`AGENTS.md`。另在 `README.md` 添加 [@L04-ZJ](https://github.com/L04-ZJ) 的贡献者署名，并新增 `.github/workflows/verify-and-package.yml`。这些都已提交在独立分支，未合并 `main`。**GitHub Contributors 自动列表需以真实提交作者为准，README 列名不会改变其统计。**

## P1 已完成：录牌与手机交互（2026-10-10）

新增唯一纯函数模块 [utils/entryEditing.ts](../utils/entryEditing.ts)：牌串解析、候选局面先整体校验再提交（`planTextHand` / `planTileAdd`）、按玩法的局面编解码。规则口径仍复用 `validateGameState`，没有第二套判断。

- **文本录牌**：`components/InputScreen.tsx` 增加粘贴/应用入口，接受 `33344466699977s`、`33344466699977条`、`123m456p789s11z`；1–14 张等效牌可作中间态录入。失败时在顶部固定条给出具体原因并**保留原手牌**，成功只替换暗手，不动副露与牌河。
- **一步撤销**：所有写入只有一个 `commit()`，只保留最近一次有效局面的一个快照（手牌/副露/牌河/墙数/定缺/文本替换/重置）。用掉即失效，无历史栈、无重做。
- **局面恢复**：以 `GameState` 为模型、每种玩法一个 `mahjong-copilot.entry.v1.<mode>` 键；初始值直接来自存储，首次写入不会用空局面覆盖旧数据；旧版本、结构损坏、玩法不符、超四张一律忽略为空局面。
- **失败提示与移动端**：第五张（含吃牌第二、三张）、14 张等效上限、四副面子上限、川麻无字/不能吃、吃牌跨度均给出具体原因；副露改为点整副只选中、右上角 `×` 才删除；键盘面板内直接提供「分析」入口；点区域时自动把该区域滚到键盘上方；墙数按玩法夹在 0–144/0–108。视觉沿用原配色、拟物牌面与圆角卡片。
- **测试**：`tests/regression.ts` 新增 P1 录入门槛一节（复核后27项守卫 + 18项问题快照），覆盖解析正反例、原子替换、副露/牌河四张上限、14张与四副面子上限、吃牌跨度、川麻门槛、局面往返与损坏数据，以及恢复后副露ID不重复、三门中间局面允许录入但不得和牌。

**实测（390×844，Chrome CDP + `npm run dev`）**：粘贴 `33344466699977条` → 14/14；刷新后重进与返回后再进均恢复 14 张；删一张→撤销回 14 张且撤销按钮随即失效；重置→撤销恢复；`8888m123p` 点第 5 张 8 万报「8万 已经有 4 张」且牌数不变；吃 8 万报跨度错误、吃 7 万报超四张、吃 5 万成功；点面子本体不删除、`×` 删除后可撤销；牌河加牌不计等效张数、点牌删除可撤销；键盘展开时面板内「分析」可点且弹窗无 90%/95%；`123m456p` 中间态分析显示「牌数未齐」且不显示数字向听；两种损坏存储与旧版本均安全空局面启动；`scrollWidth == clientWidth == 390`，无横向溢出。

## GitHub Actions：验证与可下载打包

文件：[`.github/workflows/verify-and-package.yml`](../.github/workflows/verify-and-package.yml)。触发条件为推送 `main`/`plan/**`/`feat/**`、PR 或手动 `workflow_dispatch`。

- Web 任务：Node 22 → `npm ci` → `npm test` → `npm run typecheck` → `npm run build` → 上传 `web-dist`。
- Android 任务：通过 Web 后，JDK 21 + Android SDK → `npm ci` → `npm run build` → `npx cap sync android` → `./gradlew assembleDebug` → 上传 `mahjong-copilot-debug-apk`。
- **CI 未实际出现绿色结果之前不宣称通过**。如果失败，只针对具体构建错误最小修复（检查 SDK 36/Gradle 8.14.3/Capacitor 8 的兼容性），不引入打包框架。Debug APK 不需要发布签名，不配置密钥，不自动创建 GitHub Release；Android 真机/离线仍需人工验收。
- 本工作分支上的工作流**不等于已经修改 main 的工作流**；只有工作分支触发后可以看到其结果，主分支需授权合并才会长期生效。

## P2–P4 以后再做：保留必要边界而不提前施工

- **P2 四川**：先选有来源的**一套**参考规则再算指数番/根/封顶；检查 `33344466699977s` 清对无根、`11114444777799s` 三根七对、含两碰与暗手顺子的非对对胡、`12378911m123789p` 的带幺九。不能凭重庆地名假定16倍。
- **P3 国标（分小批）**：P3a 补真实和牌上下文、全不靠/七星不靠/组合龙与合法拆分；P3b 修明暗刻杠、四张七对、不重复计番与已知错计；P3c 按价值补81番缺口。对照 [PyMahjongGB](https://github.com/ailab-pku/PyMahjongGB) 和 [GB-Mahjong](https://github.com/zheng-fan/GB-Mahjong)，但要核对争议规则。
- **P4 收尾**：本地替换 Tailwind CDN、Android 真机/离线测试、README/版本号清理及必要性能验证。**CI 验证与 Debug 打包已应用户要求提前开展**，无需到 P4 再重复建 CI。

参考来源边界：[MahjongRepository/mahjong](https://github.com/MahjongRepository/mahjong) 为日麻，仅参考向听；[sichuan-mahjong-analyzer](https://github.com/luxinghong/sichuan-mahjong-analyzer) 的许可文件与 README 表述不一致，未厘清不复制；[PaiForge UI](https://github.com/PaiForge/mahjong-react-ui) 可参考可访问性，但牌图权利另核；[majiang_calculator](https://github.com/alanfeiyuchang/majiang_calculator) 仅供个人使用，不复制代码、测试或模型。

## 本轮边界与精简记录

1. 已有 P1 基础修复（状态体系、死叫、去掉伪成功率）保留未改，本轮只做交互余项。
2. 新增文件只有 `utils/entryEditing.ts` 一个；未新增依赖、配置、框架、第二个状态机或复杂撤销记录；主屏未重设计。
3. 每批运行 `npm ci`、`npm test`、`npm run typecheck`、`npm run build`、`git diff --check`；本地提交需授权，**不推送、不合并 `main`、不发布 APK**。
4. 验证用的 CDP 截图与浏览器 profile 都在系统临时目录，未进入仓库；P0 的 18 项 `defect` 是旧错误输出的观测快照，修算法时才转成正确断言。
5. 仍有 MCR 不求人/平和/8番与地区倍率争议；P1 的 UI 不显示“已可正式结算”，无来源的 90/95% 不以“概率”展示。**不自动进入 P2/P3。**

## 交接记录

- P0：17项已修行为守卫、18项问题快照；文档核对已完成。P0 修复后复核提交 `1e0fa357`。
- P1 基础：修复无效输入的数值占位、死叫听牌标记、误导性百分比展示；本分支增加状态测试。
- P1 交互余项（本轮）：文本录牌、一步撤销、按玩法局面恢复、添加失败提示与吃牌数量校验、键盘内分析入口与遮挡滚动、副露显式删除；390×844 实测记录见上。
- 用户新授权：在 README 署名 [@L04-ZJ](https://github.com/L04-ZJ)，启用 GitHub Actions Web + Android Debug 打包；仅在该工作分支提交，不触及 `main`。
- P1 复核：仅修新增录入代码。副露ID改为跨刷新唯一，避免恢复后新增副露与旧ID相同而连带删除；川麻文本录入允许保留三门中间态，与逐张录入一致，分析仍阻止定缺未清的和牌；超张提示显示已见数量与本次添加数量，不把2+3误称为已经有4张。本轮浏览器工具连接关闭，未重做手机UI实测；以纯函数回归、类型检查和构建核验。

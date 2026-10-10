# Mahjong Copilot · 精简重组与 P1 交接计划
2026-10-10 · 当前工作分支：`feat/p1-foundation-ci-20261010`。

> **先读 [AGENTS.md](../AGENTS.md)。** 本文只保留尚待执行的具体操作、验证牌例和明确限制。P0 旧排查详见 [ISSUE_AUDIT](ISSUE_AUDIT_2026-10-10.md) 和 [REPAIR_PLAN](REPAIR_PLAN.md)。当前阶段只执行 P1，不提前解决川麻/国标全部计番。

## 阶段状态与已经落地的内容

| 阶段 | 状态 | 下一步 |
|---|---|---|
| P0 代码基线 | 已完成 | 17项正确行为守卫 + 18项既有问题行为快照；旧审计归档。DeepSeek 报告 `npm ci/test/typecheck/build` 通过，本轮修改仍需 CI 独立验证 |
| **P1 结果状态与误导性展示** | **本分支已修改，待 CI 验证** | `AnalysisResult.status` 区分 `invalid/incomplete/notReady/ready/deadWait/completeShapeScoreUnverified`；无效输入向听置 null，死叫 isReady=false，UI 删除伪成功率百分比，并更新守卫 |
| **P1 录牌与手机交互** | **待 DeepSeek 实施** | 见下方精简待办 |
| Actions 与打包 | 已添加工作流，待实际运行验证 | `web-dist` 和 **仅供测试的 Android Debug APK**，不做 Release 签名、发布或 Play Store |
| P2 四川规则 / P3 国标计番 / P4 其他 | 未开始 | 本次禁止提前展开 |

此处已有五类变更：`types.ts`、`utils/mahjongLogic.ts`、`components/AnalysisResultModal.tsx`、`tests/regression.ts`、`AGENTS.md`。另在 `README.md` 添加 [@L04-ZJ](https://github.com/L04-ZJ) 的贡献者署名，并新增 `.github/workflows/verify-and-package.yml`。这些都已提交在独立分支，未合并 `main`。**GitHub Contributors 自动列表需以真实提交作者为准，README 列名不会改变其统计。**

## P1 剩余工作：按最小范围实施

### 1. 文本录入（优先）

文件：`components/InputScreen.tsx`；可加**一个** `utils/parseTileText.ts` 纯函数。

- 接受 `33344466699977s`、`33344466699977条` 和 `123m456p789s11z`。统一牌串语法：一组数字紧随花色后缀，万=m/万、筒=p/筒、条=s/条、字=z（1–7遵循现有索引）。
- 支持 **1–14 张等效牌的录入中间态**，如 `123m456p789s11z` 是11张、允许录入但不可分析成13/14张牌局。输入解析的合法性校验与“点击分析时必须13/14张”的条件分开。
- 输入出错（未知符号、超出牌值、超14等效张、手牌＋副露＋牌河同种第5张）应拒绝并显示原因，**保留原手牌，不允许部分替换**；确认成功后只替换暗手，不自动删除副露或牌河。
- 牌面输入与文本编辑使用同一个手牌状态；不建立额外同步状态机。先做一个明确的“粘贴/应用”入口，不做 OCR 或全文智能推断。

### 2. 一步撤销与局面恢复

- 对**最近一次**有效变更保留一个快照（手牌增删、副露增删、牌河、文本替换、清空以及定缺/墙数等），提供撤销按钮；不需要完整操作历史、重做系统、命令模式。
- 以现有 `GameState` 为存储模型，每种玩法一个本地存储键，附 `version:1`；页面刷新、返回玩法首页再进入可恢复。恢复时检查结构/牌值/玩法，损坏或旧格式安全忽略或提示；刷新恢复不误写空状态覆盖旧数据。
- 不迁移到 Redux、Zustand、IndexedDB、云端账号或数据库。

### 3. 添加失败与移动端可用性

- `addTile` 的静默失败全部显示具体错误：第五张、14张上限、四副面子上限、川麻不能吃/含字牌、吃牌第二/第三张超过四张等。**先检查预期添加的所有牌，再整体提交**。
- 让副露能清楚地选择/删除；避免误触即删整副；键盘展开时仍能分析或明确收起键盘后分析；墙数夹在玩法合法范围。
- 桌面中文/英文文案、无障碍标签与按钮语义用最小改动补齐；保持原有配色、麻将牌素材、卡片及动效，不重设计主屏。
- 只调整必要的触控目标/安全区、滚动和分析入口；**390×844** 视口手动验证录牌→修正→分析完整流程。

### 4. 测试与结果

- 新增解析正反例及原子替换、一步撤销、恢复、第五张/吃牌边界的回归。可能优先提取小纯函数供 `npm test` 检验；无需引入 Vitest/Playwright 或浏览器自动化框架。
- **守卫不能固定错误行为**。无效输入 `shanten=null`；死叫 `status=deadWait`、`isReady=false`，仍可查看“剩余0张”的待牌。18项 `defect` 是旧错误输出的观测快照；以后修算法，必须把相关条目转换为正确断言，而不是盲目刷新快照。
- 仍有 MCR 不求人/平和/8番与地区倍率争议；不可让 P1 的 UI 显示“已可正式结算”。无来源的固定 90/95% 一律不得以“概率”展示。

**P1 验收**：用 `33344466699977条` 一次粘贴、改一张、撤销、重置后撤销、返回与刷新恢复；部分输入只提示牌数不够；非法副露/第五张不得污染状态；中英切换与键盘不阻碍分析；390×844 视口可操作。上述均需本地实测并记录。

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

## DeepSeek 本次操作与精简验收

1. 先核对已有基础修复，**不得重写状态模型或撤回死叫修正**；只做 P1 剩余三项。
2. 每次改动前看 `git status --short`，保护工作区；禁止未经用户授权推送或合并 `main`、发布 APK。
3. 实施后运行：
```powershell
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git diff --stat
```
4. 回报手机视口、键盘、局面存储与回退验证；查看 GitHub Actions 实际结果并如实标注失败/未运行。
5. **删减过度设计**：只保留一个解析器、一个撤销快照、一个局面存储格式、现有组件；移除未使用的新增文件/配置/依赖和重复的计划说明。完成 P1 后在本文简短标记完成即可，不再复制成第3份计划。**不自动进入 P2/P3。**

## 交接记录

- P0：17项已修行为守卫、18项问题快照；文档核对已完成。P0 修复后复核提交 `1e0fa357`。
- P1 基础：修复无效输入的数值占位、死叫听牌标记、误导性百分比展示；本分支增加状态测试。**尚未独立跑本地 npm 或获得 Actions 绿色验证，不宣称功能已验证**。
- 用户新授权：在 README 署名 [@L04-ZJ](https://github.com/L04-ZJ)，启用 GitHub Actions Web + Android Debug 打包；仅在该工作分支提交，不触及 `main`。

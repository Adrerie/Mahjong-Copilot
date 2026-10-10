# Mahjong Copilot · P2 四川规则修补
更新：2026-10-10 · 分支：`feat/p2-sichuan-rules-20261010`（本地提交落在 `feat/p1-foundation-ci-20261010`，两分支合并点相同）

> 先读 [AGENTS.md](../AGENTS.md) 与 [tests/regression.ts](../tests/regression.ts)。P2 只改四川番型、指数番、根、封顶倍率及相关测试，不动国标 MCR 与整体 UI。

## 完成情况

- P0：既有正确行为守卫 + 错误行为快照；快照是当时错误输出的记录，不是已修缺陷。
- P1：文本录牌、撤销、双模式局面恢复、异常反馈、死叫状态、键盘内分析、副露删除已完成；390×844 已验收，真机与离线未验证。
- P2（本分支）：S01/S03/S04/S05 已修复并转为守卫，四川旧番表与伪概率已删；见下方摘要。

## P2 审查摘要

**规则来源**：Hi8 血战到底示例牌桌 `https://hi8.com/g/sichuanmajiang`（`ruleId: hi8-blood-battle`，唯一来源见 `utils/sichuanAnalyzer.ts` 的 `SICHUAN_RULE`）：平胡0、对对胡1、清一色2、七对2、带幺九2、金钩钓2（包含对对胡，不双计）、每根+1，**封顶 4 指数番 = 16 倍**；`multiplier = 2^min(指数番, 4)`。该口径只是该牌桌标注的示例，不是四川/重庆统一规范。
**待核**：本环境出口只放行白名单域名，`hi8.com` 无法重新抓取，数值取自本文件此前记录的同源摘要；复合番型的叠加/替代关系仍以原页面为准。

**改动文件**
- `utils/sichuanAnalyzer.ts`：改为「合法面子拆分 + 指数番/根/封顶/倍率」。`recognizeSichuanPatterns` 返回 `patterns / baseExponent / roots / uncappedExponent / cappedExponent / multiplier / label / scoreText / pendingContext` 及 `ruleId / ruleSource`；带幺九按含幺九的 123/789 拆分判断，将对对胡限定为暗手刻子（明碰不重复占牌），七对把四张同牌当两对；未成牌的 `analyzeSichuan` 只列潜力，去掉硬编码概率。
- `utils/mahjongLogic.ts`：四川成牌使用新结构，`scoreNote` 写明来源、封顶与“不能作为结算依据”。
- `constants.ts`：新增指数番/倍/潜力/待补文案；删除旧四川番表、倍数表、杠收益、赔付、`calculateSichuanMultiplier`、`getPatternName` 等未被引用的配置。
- `types.ts`、`components/AnalysisResultModal.tsx`：`scoreText` 只在四川模式替代「N 番」显示；颜色、字体层级与卡片布局不变。

**通过的牌例**（`npm test`：33 项守卫 / 14 项 P3 快照）
- `33344466699977s`：清一色2 + 对对胡1 = 3 指数番 → **8 倍**，无根（不再是 6 番/64 倍）；同一牌型带一个杠根时 3+1=4 → 16 倍。
- 碰111p + 碰999p + 暗手 `123456m77p`：基本和 0 → 1 倍（明碰不再计成暗刻）；对照真对对胡 1 → 2 倍；副露已占的牌不能再出现在暗手。
- `12378911m123789p`：带幺九 2 → 4 倍；把将牌换成 `55m` 即退回基本和；`234/567` 顺子不含幺九时不计。
- `11114444777799s`：清一色2 + 七对2 + 根×3 = 7 → 封顶 4 → **16 倍**；无根清七对 4 → 16 倍；四张同牌但整体不是七对时根仍单算。
- `11112377889999s`：清一色2 + 带幺九2 + 根×2 = 6 → 封顶 4 → 16 倍，且指数番恒等于「番型之和 + 根」，不含自摸/杠/海底。
- 未成牌：只输出 `N 指数番 · 潜力`，概率为 0；定缺仍在 → 花猪/无法和牌；未选定缺 → 输入无效，不输出番型。

**本次精简**：删除旧四川番表/倍数表/杠收益/赔付常量、`calculateSichuanMultiplier`、`getPatternName`、四川路径的 95%/90% 伪概率、四条 P2 旧缺陷快照、临时探针脚本与本计划中已执行的 P2a/P2b 步骤。

**尚存限制**：只采用一套示例口径；自摸/点炮、杠类型与杠收支、海底/抢杠、查花猪与查大叫赔付均未建模；未做真机与离线验证；本次改动未推送，CI 只能覆盖合并点 `49e840a`（[运行 38063269170](https://github.com/Adrerie/Mahjong-Copilot/actions/runs/38063269170) Web 11/11、Android Debug APK 16/16 成功）。

## P3 / P4 暂缓

- P3 国标：补和牌上下文、特殊牌型、合法拆分和 81 番中缺失部分；先用 PyMahjongGB 与 GB-Mahjong 核验测试，不在 P2 动这些模块。
- P4：本地化 Tailwind CDN、Android 真机/离线验证与旧 README 的过期功能声明。GitHub Actions 已实现，不需再建第二套 CI。
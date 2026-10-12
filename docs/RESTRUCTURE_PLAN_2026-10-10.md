# Mahjong Copilot · P4 剩余修补清单

分支：`feat/p4-consolidated-20261012`。P4 为唯一持续收尾任务，不划分子阶段，不另开计划。执行方式见 [AGENTS.md](../AGENTS.md)。

## 已有成果（不返工）

- P0–P3：录牌/副露/牌河、撤销与持久化、国标基础和牌及番种识别、四川参考倍率；和牌来源、和牌张、圈门风、末张及明暗杠已有输入。国标按合法拆分择优；已撤下概率承诺与历史错误快照。
- P4：关键高番不计修补、杠后事件“否/未知”、未记录杠类型、Tailwind/字体本地化、README/CI 清理。**Web 与 Android Debug APK 已能构建，不代表真机已验收。**
- 本轮直接修改：`shantenCalculator.ts` 对完整的**13张等效国标牌**以实际补张判和认定0向听（涵盖七星不靠/全不靠/组合龙）；`mcrAnalyzer.ts` 的多顺子推荐锁定已吃碰杠，不再把固定碰杠重拆为自由顺子；只扩充现有两个测试组内的关键断言。README 改为 Node.js≥22 并补 macOS/Linux Gradle 命令。**以最新 Actions 为准确认本轮结果。**
- 本轮续做：特殊型向听改为公式化最小距离（`shantenCalculator.ts` 的 `knittedSpecialShanten`，不靠按花色内持有数、组合龙按六种排列减已匹配牌）；建议层把顺子/刻子候选统一走 `handCopies`/`meldedPungs`/`chowAvailable`（明碰明杠不再当自由牌，也不再重复借同一组）；UI 把国标听牌标注为“结构听牌（起和待核）”并提示 8 番事实依赖；`calculateMCRTotalFan` 在已知和牌来源且识别不到任何番种时才计无番和；平板/横屏按安全区分断点做单列/双栏自适应，Android 主题改为 edge-to-edge + `adjustResize`。真机验收结果见下。

## 尚需集中修补

1. **国标算法**：13张以外的特殊型距离已按公式给最小距离，但仍是“换张数”近似，未穷举换牌后能否再进张；建议层只把明副露锁定，未覆盖的番种仍只按牌面提示。不要为启发式建议新建通用搜索框架。
2. **结构听牌与起和**：UI 已标注“结构听牌（起和待核）”，`calculateWaitingTiles` 仍只判形状；按真实待牌计番需要和牌张与事件上下文，未做。
3. **未覆盖规则**：无番和只在已知和牌来源且除花牌外识别不到番种时计；花牌未建模。完整81番及不计/套算组合仍未穷举核实。
4. **Android 运行验收**：真机（TB710FU / Android 16）已完成安装、录牌恢复、断网冷启动与横竖屏检查，详见下方“真机验收”。浏览器仍无 Service Worker，不等同断网重开；未额外实现 PWA。
5. **工程残项**：Gradle Wrapper 跨系统命令已在 README 说明；本轮新增的 `mc-*` 响应式类为唯一布局入口，避免再叠加固定宽度容器。

## 真机验收（2026-10-12，TB710FU / Android 16 / 2000×3200@400dpi）

- Debug APK 本机 `gradlew.bat assembleDebug` 构建成功，`adb install` 成功（设备上原有同包名不同签名版本已卸载后安装）。
- 录牌：文本录牌 14 张后，`am force-stop` 冷启动再进国标，手牌、牌墙、和牌方式均恢复；杠后和牌选项为 未记录/否/杠上开花/抢杠和，杠种默认未记录。
- 断网：`svc wifi disable` 后冷启动正常，且能本地出分析结论（成牌 137 番，并列出未记录事实）。
- 屏幕：横屏 1280×800dp 双栏（录牌/上下文 与 手牌/牌河），竖屏 800×1280dp 单列；内容不再被拉成整屏一条，键盘收窄居中。

## 最少验证

重大代码修复后运行 `npm test && npm run typecheck && npm run build`；推送后看**一次**现有 Actions Web+Debug APK。保留几个决定性正反牌例与四川不回退检查；不用每番测试矩阵、不重复跑同一提交。最终报告仅列修复、限制、结果。**未经许可不合并 main。**

参考：[PyMahjongGB](https://github.com/ailab-pku/PyMahjongGB)（国标）与 [Hi8](https://hi8.com/g/sichuanmajiang)（四川示例牌桌）。

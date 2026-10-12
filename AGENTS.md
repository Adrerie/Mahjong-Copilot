# Mahjong Copilot · AGENTS.md

## 开发与版本

以 `main` 为已验证基线；新功能/规则修补用功能分支并通过测试后合并。当前后续事项集中写在 [交付与 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)，**暂记事项不代表本轮必须完成**。保持 React + TypeScript + Vite + Capacitor 与现有界面，不再新建架构、任务阶段或多余 CI。发布前同步 `package.json`、`package-lock.json`、`android/app/build.gradle` 的 `versionName`，递增 Android `versionCode`；Debug APK 不等于正式签名包。

## 规则边界

- 国标：同一合法拆分内计番、锁定吃碰杠，不重复借用。结构听牌不等于已满足8番起和；未录入的来源/风位/杠种/末张不自动补番，禁止臆造胜率。
- 四川血战：按 [Hi8 参考口径](https://hi8.com/g/sichuanmajiang)，基础番型+根+明确的特殊和牌事件，指数番封顶4番=16倍。普通自摸不自动加番；海底事件需牌墙事实。自摸加底/加番属于房间变体，不混用。
- 四川只显示单次和牌参考倍率，不伪装成杠分、查叫、一炮多响和多玩家整局结算；国标81番与地区规则均未完全覆盖。

## 最少验证

仅为高风险问题补必要正反用例；改动后统一执行 `npm test && npm run typecheck && npm run build`，核对现有 Web/Android Actions。没有实际运行新 APK 就不能声称已完成真机验收；外部代码和模型先核查许可证及权重分发许可。

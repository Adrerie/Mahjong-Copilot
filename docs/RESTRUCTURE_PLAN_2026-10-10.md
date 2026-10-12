# Mahjong Copilot · 交付与后续 TODO

已完成 P4 的手动录牌、国标/四川参考计番、平板/Android 适配；正式签名发布与完整规则结算尚未完成。当前维护版本 `1.1.0-beta.1`（Android `versionCode 2`）。本清单作为唯一待办入口，不再拆分 P5 等子阶段；规则与验证原则见 [AGENTS.md](../AGENTS.md)。

## 近期待办 · 本次记录，暂不实现

- [ ] **海底事件追踪**：四川海底捞月/海底炮当前依赖用户明确选择与牌墙剩余0/1张，不能仅凭数量还原最终摸打顺序。未来有牌局事件历史后再验证最后一张来自何处，勿凭缺失事实加番。
- [ ] **四川完整四人结算**：当前只算 Hi8 示例指数番/单次和牌参考倍率。未算杠费即时支付、杠上炮转移、一炮多响、查叫/查花猪、谁已胡、谁放炮、各家支付；也未支持房间的自摸加底/加番与不同封顶。缺四人事实时不计算，后续确需结算再加最少必要字段。
- [ ] **国标真实起和资格**：待牌列表只表示结构听牌，并未按每张待牌与真实和牌来源/事件核验8番；81番、不计/套算仍未完整穷举。优先修复有复现牌例的计算错误，不重建规则引擎。
- [ ] **设备侧独立复核**：开发记录称已在 TB710FU / Android 16 上验证四川事件切换、撤销、冷启动恢复和断网启动；此次版本升级后的 APK 尚需安装/升级及现场复测。CI 成功仅代表代码测试与 Debug APK 构建成功，不等于最新安装包已真机验收。

## 已交付（避免重复施工）

- 国标基础拆分计番、特殊形向听、固定副露不可重复借用、8番结构听牌提示；四川定缺、胡牌事件（普通、杠开、杠炮、抢杠、海底捞月/海底炮）、参考指数番及封顶。
- 游戏上下文、本地持久化、撤销、Android Debug APK、平板安全区与横屏双栏；资源本地打包。无 Service Worker，浏览器端不承诺断网冷打开。
- 海底事件已使用牌墙0/1张进行保守校验；明确来源冲突不加事件番。四川结果不再把结算诊断混在番型明细里；未做完整支付结算。

## 后续 TODO · 端侧实时辅助（尚未开发）

以下保留为未来方向，**不纳入本次合并验收**；手动录牌仍可独立运行。

- [ ] **Android 悬浮窗与屏幕捕获**：Capacitor + Kotlin 悬浮球（启停、状态、弃牌建议），用户许可后使用 MediaProjection；Android 14+ 新投影重新授权；不绕过 `FLAG_SECURE`。参考 [TextSnip](https://github.com/rhengtl/textsnip)（MIT）。
- [ ] **游戏画面识牌**：按分辨率/皮肤校准手牌、牌河、副露 ROI；优先模板匹配，必要时验证 YOLO Nano/ONNX，保留手工纠错。参考 [MahjongHelper](https://github.com/toki-2004/MahjongHelper)（MIT）、[QueHun](https://github.com/jzjzzzzzzz/quehun)（Apache-2.0）、[huanlemajiang](https://github.com/tian-xiu/huanlemajiang)（许可待核）。
- [ ] **连续牌河与副露追踪**：画面变化检测、多帧确认、四家出牌顺序及被吃碰杠移走的牌；维护简洁事件历史，不把排序后的 `discards: Tile[]` 当成出牌顺序。参考 [Mahjong Assistant](https://github.com/Blairqiao/Mahjong_Assistant) 的 DiscardTracker/TemporalDebouncer（许可待核，仅借鉴设计）。
- [ ] **轻量端侧弃牌推理**：稳定识别后复用现有合法动作/向听计算，将专用麻将策略模型与基线对比推理延迟、内存、推荐质量；国标与四川分别评价。不强制接入聊天 Qwen、RAG 或 LoRA。
- [ ] **现实牌桌摄像头识别（可选）**：与游戏投屏保持不同输入适配器，复用识别后的牌局状态；参考 [Mahjong-YOLO](https://github.com/nikmomo/Mahjong-YOLO)（MIT），核查权重与第三方依赖授权。
- [ ] **性能与合规**：验证漏牌/重复牌、耗电、热量、后台恢复、横竖屏和离线；只读分析，不自动代打、不绕过保护，遵守游戏平台规则，优先本地图像处理。

## 最小验证

仅在实质代码变更后执行 `npm test && npm run typecheck && npm run build`，并检查 Web 与 Android Debug APK 的现有 CI。用有代表性的正反牌例守护重要错误，不加额外测试框架和重复验收文档。

参考：[Hi8 四川血战](https://hi8.com/g/sichuanmajiang)、[PyMahjongGB](https://github.com/ailab-pku/PyMahjongGB)。

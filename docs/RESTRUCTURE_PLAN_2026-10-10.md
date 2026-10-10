# Mahjong Copilot · 参考项目驱动的精简重组计划
更新：2026-10-10。适用分支：`plan/reference-guided-restructure-20261010`。

**性质：交给 DeepSeek 的实施计划，不是已完成修复。** 与 [AGENTS.md](../AGENTS.md) 同读。旧 [REPAIR_PLAN](REPAIR_PLAN.md) 和 [ISSUE_AUDIT](ISSUE_AUDIT_2026-10-10.md) 保留问题证据；若旧行号、文件状态与当前代码矛盾，以实际源码和回归测试为准。

## 0. 目标、优先级与不做事项

- **产品定位**：浏览器/Capacitor 中的轻量麻将手牌分析工具，支持国标 MCR 与四川血战。最重要的是不说错、录得快、看得懂，而不是一口气实现所有玩法。
- **保留 UI**：当前霓虹色彩、深蓝主色、拟物牌、圆角卡片和动效是现有设计资产；仅修正交互、可访问性和信息组织。不得仿制参考 App 的完整布局/图案或整体换肤。
- **不做**：OCR/摄像头、YOLO、复杂 AI 对手模拟、精确概率预测、真人局跟踪、联网账户/云同步、微服务、规则 DSL/插件化、完整状态机、React Native 迁移、跨语言生产运行时、一次性重构81番。
- **交付方式**：分阶段、每阶段只实现当前指定范围；先测试再修复，报告证据后暂停等待下一批授权。禁止擅自合并 `main`、发布 APK、删用户原改动。
- **分阶段顺序**：P0 审计与测试基线 → P1 录牌可用性与结果状态 → P2 四川参考规则计番 → P3 国标计番分组修复 → P4 构建/移动端与清理。P2/P3 可依赖 P0 牌例，不能在没有规则依据时提前宣称算番完成。

## 1. 六个参考仓库：已核验的文件级参考

| 仓库与参考文件 | 本项目借鉴 | 不得误用 |
|---|---|---|
| [ailab-pku/PyMahjongGB](https://github.com/ailab-pku/PyMahjongGB) · `MahjongGB/__init__.pyi`, `MahjongGB/mahjong-algorithm/fan_calculator.cpp`, `shanten.cpp`, `unit_test.cpp` | MCR 和牌上下文：`pack/hand/winTile/flowerCount/isSelfDrawn/is4thTile/isAboutKong/isWallLast/seatWind/prevalentWind`；全不靠/组合龙和特例验证 | MIT + 内含上游 MIT；只是 oracle 候选，不代表所有地方细则唯一标准；不得把 C++/Python 运行时直接塞入前端 |
| [zheng-fan/GB-Mahjong](https://github.com/zheng-fan/GB-Mahjong) · `mahjong/fan.h`, `fan.cpp`, `handtiles.cpp`, `unit_test.cpp` | 输出具体番种所占用的面子组合、枚举和牌拆分及不计判定；用作与 PyMahjongGB 的交叉对照 | MIT；README 指出国标细节有不同解释，发生分歧应查规则来源，不盲选较大分数 |
| [MahjongRepository/mahjong](https://github.com/MahjongRepository/mahjong) · `mahjong/shanten.py`, `hand_calculating/divider.py`, `tests` | 34维牌计数、DFS/记忆化、七对/国士边界及正反例测试组织 | MIT；**日麻牌理**：七对的“7种不同对子”等条件和某些国标/四川规则不一致，绝不可原样抄分数表 |
| [luxinghong/sichuan-mahjong-analyzer](https://github.com/luxinghong/sichuan-mahjong-analyzer) · `hand_analyzer.py`, `jinting_analyzer.py`, `meld_analyzer.py`, `test_jinting.py` | 定缺、27种数牌、碰杠后的暗手张数、可读搭子建议；独立参考选叫思路 | 不含完整、可复核川渝倍率引擎；仓库 LICENSE 为 MIT、README 却写“仅供学习和个人使用”，**许可冲突未清楚前不复制源码** |
| [PaiForge/mahjong-react-ui](https://github.com/PaiForge/mahjong-react-ui) · `src/components/Hai/Hai.tsx`, `Furo/Furo.tsx`, `Tehai/Tehai.tsx`, `src/components/Hai/Hai.alt.test.tsx` | 可点击牌与展示牌区别、牌名读屏、牌尺寸/选中状态、副露方向和暗杠显示；测试可访问性 | README/package 声明 MIT，根目录未找到 LICENSE 文件；素材/第三方牌图另核版权。不要引入其 React Native 栈或复制原画 |
| [alanfeiyuchang/majiang_calculator](https://github.com/alanfeiyuchang/majiang_calculator) · `majiang calculator/MCRScoring.swift`, `MahjongScoring.swift`, `SettingsView.swift`, `Tests/MCRScoringTests.swift`, `Tests/ScoringTests.swift` | 学习规则上下文、每个面子的唯一占用、不重复计番的验收设计、自摸/点炮与规则项 UI；用其测试分类作为启发 | README 明确“源码仅供个人使用”，识牌模型仍有第三方限制；**禁止直接复制实现、测试集合、图片、权重**。对 README 的“81番全部完成”只当自述，不代替验证 |

**规则依据高于程序输出。** 国标优先核对[世界麻将组织规则](https://www.mindmahjong.com/adobe/ZC2021.pdf)及目标比赛细则；四川与重庆须写明具体平台/牌桌参考规则和版本，禁止从“重庆”地域名直接推出清对16倍。上述仓库只是实现和测试参考，不能当地方统一计番标准。

## 2. 当前基线：先补证据，避免重修 Codex 的工作（P0）

当前 `main` 审计基线提交：`99ef8af7f909584a505e20f8092eacaba357ac2f`（2026-10-10）。已存在 `utils/inputValidation.ts`、`tests/regression.ts`、`npm test`、`npm run typecheck`。历史盘点中“缺 LICENSE/无测试脚本”已过时。

1. 先运行 `git status --short`、`npm ci`、`npm test`、`npm run typecheck`、`npm run build`；记录失败和变更，不得先清除已有工作区。
2. 先在现有 `tests/regression.ts` 加精确、可复核的边界牌例，或在测试确实膨胀时才拆小文件。每例记录玩法/定缺/副露/和牌来源/规则口径、预期和实际；外部对照测试须说明差异，不要无解释地硬编码 oracle 输出。
3. 对照旧审计标记“已修、部分修、未修、待证实”，避免把已修的 A01–A08 和已有 LICENSE 重做；保留原问题 ID 供查找。
4. 补高风险回归：第五张、非法碰/吃/杠、14张等效数、杠实牌数、国标8番与结构成牌分离、定缺或三门不得和、死叫、明暗杠、四张七对/多根七对、合法面子不得重复占用。
5. 额外验证此前新发现：`mcrAnalyzer.costToMakeSeq` 仅看“存在”，可能让 `12345m` 被重复用于 `123/234/345`；五门齐独立估算重复计顺子；海底提示用13/14暗手而非真实听牌。修时统一经过候选合法拆分/剩余牌张计数。

**P0 验收**：至少新增上述风险的正反例，旧测试不回退；公开“哪些测试通过，哪些只是静态问题”表格；暂不动 UI 或两套计分体系。

## 3. 录牌与结果状态（P1，优先实施的最小可用性改进）

文件：`components/InputScreen.tsx`、`TileSelector.tsx`、`AnalysisResultModal.tsx`、`types.ts`，需要时新增**一个**纯文本解析器。

- 支持粘贴 `33344466699977s`、`33344466699977条`、`123m456p789s11z`，按当前 `types.ts` 字牌顺序。解析后整组校验并**原子替换暗手**；失败保留原局面且显示中文/英文原因。文本输入最先实现；桌面快捷键是后续可选。
- 加**一步撤销**（至少增删牌、副露、粘贴、重置）；用模式独立的 localStorage 保存/恢复局面，有版本标记，坏数据忽略并提示；不建通用 undo/redo 框架或数据库。
- 吃牌的3张逐张检查已知数，新增失败均要有反馈；牌键按剩余张数提示状态。副露切换可触达，分析按钮不随虚拟键盘完全消失，避免误删整个副露。
- 正确区分 `invalid`（输入有误）、`incomplete`、`ready`、`deadWait`、`completeShapeScoreUnverified`；无效局面不展示“8向听”“已和/推荐丢牌”。潜在番型不能显示伪“成功率”，没有可信分母不展示概率条。
- 不改当前视觉风格和牌面；只做局部排版、可点击控件语义、字号/可访问名称和本地化。

**P1 验收**：390×844 手机视口完成输入、粘贴、修改、撤销、重置、刷新恢复及分析；第五张和非法副露不会污染状态；无效结果能明确看出错误；正常用户操作不依赖确认框造成无法退出。

## 4. 四川计番（P2：有依据的最小规则预设）

文件：`utils/sichuanAnalyzer.ts`、`constants.ts`、`types.ts`、`utils/mahjongLogic.ts`，必要时一个小型计番纯函数；不得先引入独立规则引擎框架。

- 先落地**一套可注明来源的参考血战规则**，以规则名称/版本标识且说明非全国或川渝统一标准。仅提供所需的少量选项：自摸如何加、根如何算、封顶番/倍；重庆单独预设必须有清晰出处，否则放“自定义示例，未核实”而非正式重庆规则。
- 数据结果统一为 `patternNames`、`baseFanExponent`（明确指数口径）、`roots`、`extraFan`、`uncappedMultiplier`、`cappedMultiplier` 与 `source/ruleId`。不再出现常量8番却当8倍用，或自相矛盾的清对6番/64倍。
- `33344466699977s`：清对，四刻一对，无根、含9；必须先选非条的定缺，按明确规则返回对应倍率。例如仅在“清一色2指数番＋大对子1指数番”参考规则下是3指数番、8倍；不能默认承诺16倍或满牌。
- 修复刻子重复（暗手＋副露重复计），带幺九应认可合法123/789顺子，七对四张按双对处理且覆盖三根情况；所有番型以**合法完整拆分**判断，不是“存在3张就算一个刻子”。
- 暂不计算血战多玩家流水账、查花猪/查大叫赔付和完整杠收支（如仍展示则标为规则介绍，非已实现结算）。

**P2 验收**：上述清对；`12378911m123789p` 的带幺九；`11114444777799s` 的七对＋根；含明碰及暗手顺子的非对对胡反例；定缺条的全条结构不能和。每个断言注明生效的规则配置。

## 5. 国标计番（P3：分3个可验证小批，不许“一次实现全部81番”）

参考 PyMahjongGB/GB-Mahjong 只作本地对照；采用保留现有 TypeScript 模块的增量修复。

**P3a 输入上下文与合法分解**
- 补最小 `winningTile`、`isSelfDrawn`、`seatWind`、`prevalentWind`、`isWallLast`、`isAboutKong`、`is4thTile`，及明/暗/补杠必要属性；未知一律不自动推断。
- 和牌结构支持基本、七对、十三幺、全不靠/七星不靠、组合龙；枚举所有合法拆解，副露预先锁定，刻杠明暗独立；不可用一批牌多次凑顺子。
- 改善 `calculateMCRTotalFan.isValid` 的表达：完整上下文+结构有效+计番满足时才明确合法；识别尚未覆盖时标记“待核”，不能假定可比赛起和。

**P3b 已知错误的计番**
- 先修明碰被认暗刻、重复碰碰和；暗/明杠双计、四归一含杠错误；全带幺/平和遗漏分解、四张七对、三风刻/箭刻；`calculateMCRExtras` 将 allTiles 再拼 melds 的重复与 slice 截断。
- 番种结果保留引用的面子/牌实例（内部逻辑即可，不需要可视化大框架），遵守不计/套算一次、就高不就低。每项先正反例再改代码。

**P3c 缺失番种按价值逐组补齐**
- 比对 `constants.ts` 全81清单与识别器实际分支，按88/64/48等高番、特殊形、和牌场景、低番组合逐类验收。已覆盖的无须重复。
- 在完全覆盖、交叉对照、测试足够之前，界面保持“参考计番/未完成”说明，不能用建议列表等同于结算。

**P3 验收**：大三元 `555666777z12355m`、清龙 `123456789m12355p`、四张七对 `1111223344m5566p`、七星不靠 `147m258p3s1234567z`，以及同一牌形不同自摸/点和及明暗杠条件；与 oracle 不同的输出要记录具体规则差异。每小批独立交付，不等全部81番完成再看测试。

## 6. 结果、性能、构建与 Android（P4：仅必要收尾）

- 结果页分离“结构可和”“规则可结算”“参考番型”“进张”“未见张数”，按出牌建议先比较向听、有效张数，再参考番型潜力；消除经验概率95%、90%等。
- 避免对每种弃牌候选反复无缓存地重新枚举所有向听/番型。先测真实手机典型14张耗时，**只有观察到明显卡顿才加局部记忆化**，不引入 Worker/服务端预计算。
- 将远程 Tailwind Play CDN 转为构建时本地 CSS，采用系统字体回退，避免首次离线界面损坏；不把外部牌图变成本项目依赖。
- 修复输入页安全区和 `100dvh`/键盘遮挡、Esc/返回键/无障碍标签、中英混用；修正文档和版本号、PWA/实时分析的过度声明。Android 真机和离线启动需实测，未实测要标记。
- GitHub Actions 只添加最简 `npm ci && npm test && npm run typecheck && npm run build`，避免同时引入庞大 CI 矩阵或新框架。

## 7. 每批必执行的删除过度设计检查

在该批测试通过后对新增内容做一次“简化审查”，删除不必要的抽象，并将计划中已被证伪或未授权的需求删减：

- 删除没有使用方的新增配置/规则开关、只为未来玩法而做的接口、重复工具函数、未使用依赖和新引入的层级包装。
- 不因“完整架构”引入跨语言服务、状态机、全局 Store、复杂统计引擎、截图识牌或规则 DSL。只保留实现当前验收所必需的代码与测试。
- 同样删减**计划文本**：完成的任务移到简短 Changelog，删除过时的步骤、重复要求和不必要的未来功能；保留核心验收牌例与已知限制。
- 删除只限本次自己新增且确认无用的内容，不清理用户旧资源、不自动移除 Android 项目、不重写整个 README。
- 简化之后重新跑对应回归、`npm run typecheck`、`npm run build`，用 `git diff --check` 查差异；需修改本计划时直接更新本文档，不创建层层递归的新计划文档。

## 8. DeepSeek 执行与交接

**首次执行仅请求 P0（验证基线＋测试与问题归档），不要同时启动 P1–P4。** 等用户审阅报告后决定下一批。

每批最小报告格式：本批目标；参考资料与许可证检查；已确认错误与修复文件；新增正反例与运行命令及输出摘要；未完成/冲突规则；精简清单（保留/删减）；当前 Git 状态。不自行 commit/push/merge，除非用户另有明确授权。

Windows PowerShell 在项目根目录执行：

```powershell
git status --short
git branch --show-current
npm ci
npm test
npm run typecheck
npm run build
git diff --check
git diff --stat
```

**操作注意**：主线已有 Codex 修复；不要从历史审计旧行号直接判定今天仍坏。只有打开现有源码并复现后才改。任何新增代码尽量限制于 `utils/`、`components/`、`types.ts`、`constants.ts`、`tests/`。

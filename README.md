<div align="center">

# 🀄 Mahjong Copilot 麻将助手

**智能麻将分析工具** | **国标麻将** 🇨🇳 **四川血战** 🔴

**当前版本：1.1.0-beta.1（Android versionCode 2，测试版）**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

</div>

---

## 📖 项目简介

Mahjong Copilot 是一款麻将辅助分析工具：录入手牌、副露与牌河，得到向听数、听牌张、番种建议与番数。

### ✨ 功能特性

- 🎯 **双模式支持**：国标麻将（81 番）& 四川血战（成都玩法）
- 📊 **智能分析**：向听数与听牌列表，按实体牌计算缺张
- 🏆 **番种建议**：在同一合法拆分内识别番种，按番值择优
- 🔢 **番数计算**：国标 8 番起和判定，四川指数番与封顶
- 🧮 **可核对上下文**：国标可记录自摸/点和、和牌张、末张、门风/圈风、杠后和牌与杠类型；四川可记录自摸/点炮及普通、杠上开花、杠上炮、抢杠胡、海底事件。未知事实不自动计番。国标待牌只按结构判断，不保证每张待牌满足8番起和。
- 🌏 **双语界面**：支持中文/English 切换
- 📱 **响应式设计**：适配电脑、平板、手机
- 📴 **无外部运行时依赖**：Tailwind 与字体本地打包，运行时不请求 CDN；离线使用需由本地静态服务器或已安装的 App 提供页面（没有 Service Worker 缓存，浏览器端不能断网重开）

### 🀄 四川麻将口径

| 指数番 | 番型 |
|:---:|:---|
| 0 | 平胡 |
| 1 | 对对胡 |
| 2 | 清一色、七对、带幺九、金钩钓 |
| +1/根 | 每 4 张相同牌算一根 |

> 📌 指数番相加，倍率 = 2^min(指数番, 4)（最多16倍）。明确录入且事实一致的杠上开花、杠上炮、抢杠胡、海底捞月、海底炮各 +1 指数番；**海底事件还要求牌墙见底**。普通自摸/点炮不默认额外加番。不同房间可能使用“自摸加底/加番”，本应用不混用；**只给单次和牌参考倍率，不计算杠费、多人支付、查叫/花猪等整局结算**。以上采用 [Hi8 示例牌桌](https://hi8.com/g/sichuanmajiang)，非四川统一标准。

---

## 📁 项目结构

```
Mahjong-Copilot/
├── App.tsx                 # 主应用组件
├── index.tsx               # 入口文件
├── index.css               # Tailwind 入口与自定义工具类（本地构建）
├── tailwind.config.js      # Tailwind 配置
├── postcss.config.js       # PostCSS 配置
├── constants.ts            # 番种定义、文本字典
├── types.ts                # TypeScript 类型定义
├── components/
│   ├── InputScreen.tsx     # 手牌与和牌上下文输入
│   ├── TileSelector.tsx    # 牌选择器键盘
│   ├── TileUI.tsx          # 麻将牌 UI 组件
│   ├── ModeSelection.tsx   # 模式选择（国标/四川）
│   └── AnalysisResultModal.tsx  # 分析结果弹窗
├── utils/
│   ├── mahjongLogic.ts     # 核心分析逻辑
│   ├── entryEditing.ts     # 录入编辑与本地局面存取
│   ├── inputValidation.ts  # 局面校验
│   ├── sichuanAnalyzer.ts  # 四川麻将分析模块
│   ├── mcrAnalyzer.ts      # 国标麻将分析模块
│   ├── mcrPatterns.ts      # 国标番型检测
│   ├── shantenCalculator.ts # 向听数计算
│   ├── winningChecker.ts   # 和牌检测
│   ├── discardAnalyzer.ts  # 弃牌推荐
│   └── tileHelpers.ts      # 牌操作工具函数
├── tests/regression.ts     # 关键回归守卫（npm test）
└── scripts/test.mjs        # 测试运行器
```

---

## 🚀 本地部署

### 环境要求

- **Node.js** >= 22.0（Capacitor 8 要求）
- **npm** >= 9.0

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/Adrerie/Mahjong-Copilot.git
cd Mahjong-Copilot

# 2. 按锁文件安装依赖
npm ci

# 3. 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:3000`。

### 校验与生产构建

```bash
npm test          # 回归守卫
npm run typecheck # 类型检查
npm run build     # 构建到 dist/
npm run preview   # 本地预览构建产物
```

构建产物在 `dist/` 目录下，无外部运行时依赖：用 `npm run preview` 或任意静态服务器提供 `dist/` 即可断网运行。资源路径是绝对路径，直接双击 `dist/index.html`（`file://`）打不开；Android 侧由 Capacitor 从本地加载 `dist/`，不联网。

---

## 🖼️ 国标游戏截图导入（实验功能）

在国标录牌界面展开「从国标麻将截图导入手牌」，选择平板本地截图。当前只适配提供的 **16:10 横屏游戏画面**（参考分辨率 2048×1280），可分割底部13张与右侧可选摸入第14张，兼容一张手牌上移选中。识别器内置 **11种牌面参考指纹**，未覆盖全部34种；未知或不可靠牌保持「待确认」，请逐槽检查和修正。显式确认并成功导入后，仅将本次人工核验的量化指纹少量保存在本机，供以后识别其他牌面，**不是训练模型，也不会上传照片**。

导入时可选 **新局面**（重置旧牌河、副露和默认牌墙）或 **继续本局**（保留已确认牌河）。两张确认过的截图仅比较暗手变化：13→14 标记可能摸入，14→13 只有经用户勾选确认才记已打出的牌；跳帧或碰杠不能自动推断。两种方式均可撤销。**国标与四川均保留出牌辅助**：13张显示改善结构向听的进张方向（不是现在弃牌，也不是摸牌概率），14张未成牌时显示推荐弃牌及有效进张；国标结构已和但8番资格不足或待核时，先提示核验起和条件，并显示若不能和时的续打备选。仅在设备本地解码图像，当前**不支持系统悬浮窗自动截屏、持续牌河追踪或全牌面自动识别**，也不保证识别准确率。后续工作集中记录在 [TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

---

## 真实牌桌照片（Android 端侧 YOLO，可选实验功能）

真实照片不能复用游戏截图的14个固定裁切槽。现有 Android 原生 `RealTableDetector` 使用 ONNX Runtime 对整张照片运行本地 YOLO：候选框全部从“未分配”开始，用户需要逐项校正牌面及归属（本人暗手／已确认牌河／忽略），并可补录漏识别的手牌。验证13/14张及同牌不超4张后才能写局面，手动输入始终保留。静态照片**不能推断牌河时间顺序、他家隐牌或碰杠历史**。

**注意：普通仓库构建默认不含模型文件。** 若未自行导出 ONNX 到 Android assets，界面会明确显示模型不可用，绝不自动下载或偷偷使用远端服务器。

开发机批量检验（非 Android 内置功能；可一次测试3张或更多照片；本次本地评测记录为5张）：

```powershell
python -m pip install ultralytics
# 先从 https://github.com/nikmomo/Mahjong-YOLO 下载 nano .pt 权重到本机
python scripts/evaluate_real_table.py --image-dir "D:\\Photos\\mahjong" --weights "D:\\models\\mahjong-yolon-best.pt" --out "real-table-eval"
# 或指定文件：--images "D:\\Photos\\a.jpg" "D:\\Photos\\b.jpg" "D:\\Photos\\c.jpg"
```

每张照片分别生成 `detections.jpg` 和 `detections.json`，另有 `summary.json` 与等待人工填写正确框/错框/漏框的 `review.csv`。输出包含输入图像与权重 SHA-256 和实际推理参数；**复测请使用新的 `--out` 目录**，脚本不会静默覆盖既有人工复核结果。统计的检测框数量**不是识别准确率**；3张图只作初步可行性判断。候选牌全部标记为 `unassigned`，必须核实本人手牌、可见牌池、副露、他家及未知归属。

### 本地转换并打包 Android 模型

使用**本人本地已有且获准使用**的麻将 YOLO Nano `.pt` 权重；代码只提供导出和端侧推理，不提交版权及分发条件尚未核实的二进制文件：

```powershell
python -m pip install ultralytics onnx
python scripts/export_android_yolo.py --weights "D:\\models\\mahjong-yolon-best.pt"
npm run build
npx cap sync android
cd android
.\\gradlew.bat assembleDebug
```

导出脚本校验37类、固定FP32 `[1,3,640,640]` 与41通道原始输出，生成 `android/app/src/main/assets/mahjong_detector.onnx` 和 `mahjong_detector.json`（权重 SHA-256 与类别表）。两个文件默认不入 Git；**必须在同一台机器先导出再构建 APK**，否则普通 CI APK 不含模型。原生端完成 letterbox、模型推理、NMS 和坐标还原；默认 `imgsz=640/conf=0.22/iou=0.7`，仅为小样本测试起点。请真机比较同图 PC/Android 输出及运行内存，核对第三方权重、数据集和 Ultralytics 的分发许可后才能公开发布内置模型版。

游戏实时识别下一步改用 Android 用户主动授权的 MediaProjection + 前台服务 + 用户确认后的帧差更新；当前仍是**导入游戏截图**，没有系统级悬浮窗/持续录屏，不绕过受保护画面。

端侧策略预研优先选择**现成麻将策略权重**，不自行训练、微调、蒸馏或搭建自博弈环境。国标可在 [Botzone](https://www.botzone.org.cn/) 比较有授权的国标 Agent，再于 Android 平板复核相同局面的动作、推理延迟和内存；当前弃牌评分器维持默认可运行基线。四川先保留现有策略与定缺约束，之后再筛可复用的现成血战权重。Qwen/RAG 只有可测增益时才考虑，日麻暂缓。详见 [统一 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

---

## 📱 Android（Capacitor）

```bash
# 构建并同步到原生工程
npm run build
npm run capacitor:sync

# Windows：生成 Debug APK（仅供测试安装）
npm run android:assembleDebug

# macOS / Linux：使用仓库内 Gradle Wrapper（实际命令，不是注释）
cd android && ./gradlew assembleDebug
```

`android/` 工程已随仓库提交，`capacitor.config.json` 的 `webDir` 指向 `dist`。APK `applicationId` 为 `com.karislin.mahjong`，`versionName=1.1.0-beta.1`、`versionCode=2`；它们与 npm 版本一致。Debug APK 用于安装测试，**不是正式签名发行包**；更换签名证书的 APK 可能需要先卸载旧包，卸载会清除本地存储。

### Android 真机安全检查

Windows PowerShell，在 **ADB 已授权且恰好连接一台设备**、Debug APK 构建完成后：

```powershell
.\scripts\check_android_device.ps1           # 只检查设备、APK SHA256 与 ONNX 是否在包内
.\scripts\check_android_device.ps1 -Install  # 明确覆盖安装，不清空应用数据
.\scripts\check_android_device.ps1 -Logs     # 仅本机查看最近崩溃/Capacitor 日志
```

脚本不能代替真人在游戏内测试：需要逐项检查手录、截图、实拍、撤销、横竖屏、离线与切后台。若遇 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，通常需要核对签名证书；**不要自动卸载旧 App 以免丢失存档**。当前 MediaProjection 实时悬浮窗尚处于计划阶段；普通 Debug APK 默认不含 YOLO 权重，必须在本机导出模型并重新构建才可能在应用内加载。具体步骤见 [唯一 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

应用在 Android 上使用 edge-to-edge 主题，界面按安全区（`env(safe-area-inset-*)`）留边；平板横屏（≥1000px）为录牌/上下文与手牌/牌河双栏，竖屏和手机保持单列，键盘在宽屏上限宽居中，不用固定宽度容器包裹整页。

---

## 🛠 技术栈

| 技术 | 用途 |
|:---|:---|
| React 19 | UI 框架 |
| TypeScript 5.8 | 类型安全 |
| Vite 6 | 构建工具 |
| TailwindCSS 3 + PostCSS | 样式方案（本地构建，无 CDN） |
| Capacitor 8 | Android 打包 |

---

## 贡献者 / Contributors

- [@Adrerie](https://github.com/Adrerie) — 项目维护者
- [@L04-ZJ](https://github.com/L04-ZJ) — 项目审阅、测试与改进协作

GitHub 自动统计的 Contributors/贡献图由实际提交作者及合并记录决定，README 列名不会代替 Git 提交归属。

## 后续计划

**长期设计取舍及参考来源**保存在根目录 [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md)，包括保留、简化、延期和不做的功能，供最终优化时重议；当前唯一执行队列仍在 [TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

下一步重点：导出已授权模型并实测含ONNX资产的Android APK、实拍人工校正端到端、游戏连续截图验证，继而经用户授权加入 MediaProjection 和轻量悬浮提醒。规则遗留包括四川完整时序和结算、国标逐张8番起和、完整番种边界；正式签名APK需另测覆盖安装及存档保留。详见 [后续 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

## 自动验证与构建

GitHub Actions 工作流：[Verify and package](.github/workflows/verify-and-package.yml)。在分支推送或 PR 时运行 `npm test`、`npm run typecheck`、`npm run build`，并打包 `web-dist` 与 `mahjong-copilot-debug-apk` 两种可下载的运行产物。Debug APK 供测试安装，**不是正式签名发行包**。构建是否成功以 [Actions 页面](https://github.com/Adrerie/Mahjong-Copilot/actions)的实时结果为准。

## GitHub Releases（正式签名的 Android Beta 包）

**发布前需要配置的四项 Repository Secrets**（GitHub → Settings → Secrets and variables → Actions）：

- `ANDROID_KEYSTORE_BASE64`：原始签名密钥库文件的 Base64 内容
- `ANDROID_STORE_PASSWORD`：密钥库密码
- `ANDROID_KEY_ALIAS`：签名密钥别名
- `ANDROID_KEY_PASSWORD`：密钥密码

不要将 JKS/keystore、密码、Base64 密钥内容或包含它们的配置文件提交到仓库。CI 运行时才将密钥恢复到临时目录，使用既有 `android/app/build.gradle` 中的环境变量签名配置，并在任务结束时删除临时密钥文件。**不要在 PR 日志或评论中粘贴密钥。**

### 构建及验证机制

- **PR、功能分支**：仅执行 Web 测试、类型检查、前端构建和 Android Debug APK 构建；不会提供签名密钥。
- **推送到 `main`**：全部基础检查通过后，再构建 `assembleRelease`，用 `keytool` 核验密钥库与别名，用 `apksigner` 核验 APK 签名，并核验包名、版本号。通过后生成 Actions Artifact `mahjong-copilot-signed-release-apk`；**不会自动创建公开的 GitHub Release**。这也是首次配置 Secrets 后的验证方式。
- **推送 `v*` 版本 Tag**：在上述成功基础上检查 Tag 与 `package.json` / Android `versionName` 一致、提交属于 `main` 历史，然后以**签名 Release APK**创建 GitHub Pre-release。APK 命名为 `Mahjong-Copilot-v<version>-release.apk`。

请先将相关 PR 合并到 `main`，确认 [Actions](https://github.com/Adrerie/Mahjong-Copilot/actions) 中 `Build and verify signed release APK` 运行成功，再创建版本 Tag：

```bash
git switch main
git pull --ff-only origin main
git tag -a v1.1.0-beta.1 -m "Mahjong Copilot 1.1.0 beta 1"
git push origin v1.1.0-beta.1
```

构建成功的签名包在 [Releases](https://github.com/Adrerie/Mahjong-Copilot/releases) 中下载。**必须长期保存同一签名密钥**，后续版本才能正常覆盖安装。Debug APK 与 Release APK 使用不同签名证书，不能直接互相覆盖安装；卸载旧版会清除其本地数据。未来每次发布应同步 npm 与 Android 版本号，并递增 `versionCode`。

## 📄 开源协议

GPL-3.0 License © 2026 [Adrerie](https://github.com/Adrerie)

本项目以 GPL-3.0 协议发布，允许复制、修改与分发，但需在相同许可证下传播（Copyleft）。详情参见 [LICENSE](LICENSE)。

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star！**

</div>
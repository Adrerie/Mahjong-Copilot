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

已确认但暂不解决的四项：海底事件需要完整摸打时序、四川整局支付/地方变体、国标逐张8番起和核验、最新版 APK 独立真机复测。悬浮窗、自动牌河、端侧模型与摄像头识别也已列入后续路线，**本版尚未实现**。详见 [后续 TODO](docs/RESTRUCTURE_PLAN_2026-10-10.md)。

## 自动验证与构建

GitHub Actions 工作流：[Verify and package](.github/workflows/verify-and-package.yml)。在分支推送或 PR 时运行 `npm test`、`npm run typecheck`、`npm run build`，并打包 `web-dist` 与 `mahjong-copilot-debug-apk` 两种可下载的运行产物。Debug APK 供测试安装，**不是正式签名发行包**。构建是否成功以 [Actions 页面](https://github.com/Adrerie/Mahjong-Copilot/actions)的实时结果为准。

## GitHub Releases（版本 Tag 发布）

普通推送和 PR 仍只上传临时 Actions Artifact，不会产生 Release。**只有推送与版本号一致的 `v*` Tag**，并且现有测试、类型检查、Web 和 Android Debug APK 构建成功后，工作流才自动创建 [Releases](https://github.com/Adrerie/Mahjong-Copilot/releases) 中的 **Pre-release**，附带重命名的 APK。版本 Tag 必须指向 `main` 已包含的提交。

当前版本可这样发布（须先把发布工作流合并到 `main`）：

```bash
git switch main
git pull --ff-only origin main
git tag -a v1.1.0-beta.1 -m "Mahjong Copilot 1.1.0 beta 1"
git push origin v1.1.0-beta.1
```

不要在发布工作流合并之前给旧提交打 Tag。本机制只发 **Debug 预览包**，不使用正式发布签名；不同 CI 构建的调试签名可能不同，导致覆盖安装失败，卸载会清除本地局面数据。未来向用户提供可持续升级的安装包时，须先配置稳定的签名密钥并单独构建签名 Release APK。

## 📄 开源协议

GPL-3.0 License © 2026 [Adrerie](https://github.com/Adrerie)

本项目以 GPL-3.0 协议发布，允许复制、修改与分发，但需在相同许可证下传播（Copyleft）。详情参见 [LICENSE](LICENSE)。

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star！**

</div>
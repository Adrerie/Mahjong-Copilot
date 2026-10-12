<div align="center">

# 🀄 Mahjong Copilot 麻将助手

**智能麻将分析工具** | **国标麻将** 🇨🇳 **四川血战** 🔴

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
- 🧮 **可核对上下文**：国标可记录自摸/点和、和牌张、末张、门风/圈风、杠后和牌（是/否/杠上开花/抢杠和）、明杠/暗杠/补杠；杠类型默认「未记录」，只有主动选择后才计对应番，未记录的事实一律不计番并提示还缺哪些信息
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

> 📌 番数相加，倍数 = 2^番数，封顶 4 指数番（16 倍）。自摸/点炮、杠类型等事件未建模，不加番。

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

# 2. 安装依赖
npm install

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

# macOS / Linux：使用仓库内 Gradle Wrapper
# cd android && ./gradlew assembleDebug
```

`android/` 工程已随仓库提交，`capacitor.config.json` 的 `webDir` 指向 `dist`。Debug APK 不是正式签名发行包。

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

## 自动验证与构建

GitHub Actions 工作流：[Verify and package](.github/workflows/verify-and-package.yml)。在分支推送或 PR 时运行 `npm test`、`npm run typecheck`、`npm run build`，并打包 `web-dist` 与 `mahjong-copilot-debug-apk` 两种可下载的运行产物。Debug APK 供测试安装，**不是正式签名发行包**。构建是否成功以 [Actions 页面](https://github.com/Adrerie/Mahjong-Copilot/actions)的实时结果为准。

## 📄 开源协议

GPL-3.0 License © 2026 [Adrerie](https://github.com/Adrerie)

本项目以 GPL-3.0 协议发布，允许复制、修改与分发，但需在相同许可证下传播（Copyleft）。详情参见 [LICENSE](LICENSE)。

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star！**

</div>
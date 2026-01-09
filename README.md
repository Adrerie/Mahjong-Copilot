<div align="center">

# 🀄 Mahjong Copilot 麻将助手

**智能麻将分析工具** | **国标麻将** 🇨🇳 **四川血战** 🔴

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](README.md) | [中文](README.md)

</div>

---

## 📖 项目简介

Mahjong Copilot 是一款专业的麻将辅助分析工具，帮助玩家分析手牌、计算向听数、推荐最优打法。

### ✨ 功能特性

- 🎯 **双模式支持**：国标麻将（81番）& 四川血战（成都玩法）
- 📊 **智能分析**：实时计算向听数，推荐最优弃牌
- 🏆 **番种建议**：从大番到小番优先推荐，最大化收益
- 🔢 **番数计算**：自动识别番型，计算最终番数/倍数
- 🌏 **双语界面**：支持中文/English切换
- 📱 **响应式设计**：适配电脑、平板、手机

### 🀄 四川麻将番种体系

| 番数 | 番种 |
|:---:|:---|
| 8番 | 清金钩钓、清七对/清龙七对 |
| 6番 | 清对（清一色+对对胡） |
| 4番 | 清一色、金钩钓、七对/龙七对、将对、带幺九 |
| 2番 | 门前清(自摸)、断幺九、对对胡 |
| 1番 | 基本和（平胡/鸡和） |
| +N番 | 根（每4张相同牌+1番） |

> 📌 四川麻将计算规则：番数相加，倍数 = 2^番数

---

## 📁 项目结构

```
Mahjong-Copilot/
├── App.tsx                 # 主应用组件
├── index.tsx               # 入口文件
├── constants.ts            # 番种定义、文本字典
├── types.ts                # TypeScript类型定义
├── components/
│   ├── InputScreen.tsx     # 手牌输入界面
│   ├── TileSelector.tsx    # 牌选择器键盘
│   ├── TileUI.tsx          # 麻将牌UI组件
│   ├── ModeSelection.tsx   # 模式选择（国标/四川）
│   └── AnalysisResultModal.tsx  # 分析结果弹窗
├── utils/
│   ├── mahjongLogic.ts     # 核心分析逻辑
│   ├── sichuanAnalyzer.ts  # 四川麻将分析模块
│   ├── mcrAnalyzer.ts      # 国标麻将分析模块
│   ├── mcrPatterns.ts      # 国标番型检测
│   ├── shantenCalculator.ts # 向听数计算
│   ├── winningChecker.ts   # 和牌检测
│   ├── discardAnalyzer.ts  # 弃牌推荐
│   └── tileHelpers.ts      # 牌操作工具函数
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🚀 本地部署

### 环境要求

- **Node.js** >= 18.0
- **npm** >= 9.0 或 **pnpm** >= 8.0

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

打开浏览器访问 `http://localhost:5173`

### 生产构建

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

构建产物在 `dist/` 目录下，可直接部署到任何静态托管服务。

---

## 📦 打包成桌面APP

使用 [Electron](https://www.electronjs.org/) 或 [Tauri](https://tauri.app/) 将 Web 应用打包成桌面应用。

### 方案一：Electron（推荐新手）

```bash
# 1. 安装 Electron 相关依赖
npm install electron electron-builder --save-dev

# 2. 创建 electron/main.js
```

创建 `electron/main.js`：
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // 加载构建后的文件
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

在 `package.json` 添加：
```json
{
  "main": "electron/main.js",
  "scripts": {
    "electron": "npm run build && electron .",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  },
  "build": {
    "appId": "com.mahjong.copilot",
    "productName": "Mahjong Copilot",
    "directories": { "output": "release" },
    "win": { "target": "nsis" },
    "mac": { "target": "dmg" }
  }
}
```

```bash
# 运行桌面应用
npm run electron

# 打包安装程序
npm run dist
```

### 方案二：Tauri（更轻量，推荐）

Tauri 打包体积更小（约 5-10MB vs Electron 150MB+）

```bash
# 1. 安装 Tauri CLI
npm install @tauri-apps/cli --save-dev

# 2. 初始化 Tauri
npx tauri init

# 3. 开发模式
npx tauri dev

# 4. 构建安装包
npx tauri build
```

---

## 📱 打包成手机APP

### 方案一：PWA（推荐）

项目已支持 PWA，可直接"添加到主屏幕"使用。

### 方案二：Capacitor

```bash
# 1. 安装 Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init "Mahjong Copilot" "com.mahjong.copilot"

# 2. 添加平台
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios

# 3. 构建并同步
npm run build
npx cap sync

# 4. 打开原生项目
npx cap open android  # 用 Android Studio 打开
npx cap open ios      # 用 Xcode 打开
```

---

## 🛠 技术栈

| 技术 | 用途 |
|:---|:---|
| React 19 | UI框架 |
| TypeScript 5.8 | 类型安全 |
| Vite 6 | 构建工具 |
| TailwindCSS | 样式方案（内联） |

---

## 📄 开源协议

GTP-3.0 @ [Adrerie](https://github.com/Adrerie)

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star！**

</div>

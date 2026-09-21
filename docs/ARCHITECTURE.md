# 系统架构

## 运行形态

项目同时支持两种运行方式：

1. Web 开发模式：`app.js` 启动 Express，数据目录为项目内 `data/`。
2. Electron 桌面模式：主进程装配同一个 Express 应用，数据目录由 `app.getPath('userData')` 注入；BrowserWindow 只加载本项目同源页面。

```text
BrowserWindow / Browser
        │ HTTP + JSON
        ▼
      app.js ───────────────┐
        │                   │
        ├─ views + public   │
        ├─ services         │
        │   ├─ daily ───────┼─ qimen.calculate() ─ lib/
        │   ├─ almanac ─────┼─ lunar-javascript
        │   ├─ AI ──────────┼─ prompt-builder ─ provider (可选网络)
        └─ storage ─────────┴─ JSON（注入的 baseDir）

Electron main
  ├─ Express 生命周期与健康检查
  └─ 主窗口、单实例与导航边界
```

## 模块边界

- `lib/`：确定性奇门排盘核心，不依赖 AI、Electron 或存储。
- `services/`：业务编排；把排盘、黄历、记录、AI 和本地建议能力保持为独立模块。
- `storage/`：只负责 JSON 初始化、验证和读写，实际目录由入口注入。
- `app.js`：依赖装配、页面路由与 API；不承载核心算法。
- `electron/`：桌面生命周期、安全设置与主窗口导航边界。
- `views/`、`public/`：页面与 Renderer 表现层，不接触 API Key 或 Node API。

## 数据路径

Web 模式使用 `<project>/data`。桌面模式使用 `<userData>/data` 或对应服务约定的 userData 子目录。首次桌面启动只在目标记录文件不存在时复制项目数据，不覆盖既有 userData，也不删除项目数据。

## 安全边界

- Electron Renderer 使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload 只暴露最小、命名明确的 IPC 接口。
- 外部网址不在应用 BrowserWindow 内导航。
- AI 密钥只由服务端存储和读取，GET 设置接口仅返回是否已配置。
- 本地确定性模块在断网时仍可运行；只有可选 AI Provider 依赖网络。

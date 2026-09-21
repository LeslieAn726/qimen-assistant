# 贡献指南

感谢你帮助改进“每日奇门助手”。本项目重视可验证性、离线能力和用户数据安全。

## 开发环境

需要 Node.js 22.12 或更高版本、npm 10 或更高版本，以及 Windows（桌面打包与完整 Electron 验收）。

```bash
npm ci
npm test
npm run desktop
```

## 变更原则

- 奇门排盘算法与显示层、AI 层、存储层保持分离。
- AI 只能读取现有确定性结果，不得重算或改写盘面。
- 黄历必须由本地 `lunar-javascript` 计算，不依赖在线服务。
- 不提交真实 API Key、用户记录、备份、日志、安装包或调试输出。
- 保持 Electron `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。

## 提交流程

1. 从当前主分支创建目标明确的分支。
2. 只修改与问题有关的文件，不做无关格式化。
3. 新功能或缺陷修复应补充测试。
4. 运行 `npm test`；涉及桌面功能时还需运行 `npm run desktop`。
5. 涉及打包资源时运行 `npm run build:win` 并检查 `dist/win-unpacked/每日奇门助手.exe`。
6. 在 Pull Request 中写清行为变化、验证步骤、隐私影响和兼容性风险。

## 代码风格

- 使用现有 CommonJS 与原生 JavaScript 风格。
- 优先小模块和依赖注入，避免把业务逻辑堆入 `app.js` 或 Electron 主进程。
- 错误提示面向用户时使用清楚的中文；日志不得包含密钥和私人记录正文。
- 不新增依赖，除非标准库和现有依赖无法安全完成需求，并在 PR 中说明理由。

## 许可证

提交代码即表示你有权按本项目 MIT License 提供该贡献。美术、字体、声音及其他非代码素材必须给出来源和明确的再分发授权。

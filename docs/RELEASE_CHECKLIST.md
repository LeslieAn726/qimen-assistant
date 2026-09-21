# V2.6 Release 检查清单

本清单必须在带完整 `.git` 元数据且可执行 Git 的发布工作区中完成。检查发现问题时先记录，不自动改写 Git 历史。

## 版本与文档

- [ ] `package.json`、`package-lock.json` 与 Changelog 版本一致
- [ ] `appId` 保持 `com.qimen.assistant`
- [ ] `productName` 保持“每日奇门助手”
- [ ] 根 `LICENSE` 的原项目版权人信息已由维护者核实
- [ ] README、隐私与第三方声明均为当前版本

## Git 工作区

```bash
git status --short
git status --ignored --short
git log --stat --all
git rev-list --objects --all
```

确认未跟踪或未提交：

- `node_modules/`、`dist/`、`debug/`、`preview/`
- `.env*`、API Key、日志、临时文件
- `daily-records.json`、`settings.json`、备份和 Electron userData
- PPT、ZIP、预览产物和开发机绝对路径
- 本地 `archive/desktop-pet/` 研究归档

如果 Git 历史曾包含上述敏感数据或第三方素材，只报告具体 commit/路径；在获得维护者确认前不要自动执行 filter-repo、rebase 或强制推送。

## 测试与构建

```bash
npm test
npm run build:win
```

- [ ] 测试全部通过
- [ ] 构建日志不含 `default Electron icon is used`
- [ ] `dist/每日奇门助手-Setup-2.6.0-beta.exe` 已生成
- [ ] `dist/win-unpacked/每日奇门助手.exe` 可启动
- [ ] ASAR 包含 `assets/icon.ico`
- [ ] ASAR 不包含 `assets/pets`、`public/pet`、`pet`、归档、用户数据、备份、环境文件、测试或开发产物
- [ ] 启动后只创建每日奇门助手主窗口

## Release 附件

只上传本次版本的安装包及必要校验文件，不要把整个 `dist/`、旧版本安装包、`win-unpacked/`、调试输出或用户数据作为附件。

# 应用图标来源记录

- 用途：每日奇门助手 Windows 应用图标
- 生成日期：2026-09-20
- 生成方式：OpenAI 内置图像生成工具
- 输入参考图：无
- 第三方角色或品牌元素：无
- 本地后处理：使用 Electron `nativeImage` 缩放，并由 `scripts/build-app-icon.js` 封装为 256、128、64、32、16 像素 PNG 图层的 ICO

## 设计约束

图标使用深蓝星空背景、抽象九宫格、八卦式环形几何与金色星点。生成要求明确排除人物、动漫角色、动物、第三方商标、文字和水印。

源图保存在 `assets/icon-source.png`，构建图标为 `assets/icon.ico`。源图不会进入应用 ASAR，ICO 会进入 Windows 发行包。

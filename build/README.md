# Windows 构建资源

当前 Windows 构建使用 `assets/icon.ico`，并在 `electron-builder.yml` 的 `win.icon` 中明确配置。

图标包含 256、128、64、32、16 像素 PNG 图层；来源和本地处理方式见 `assets/ICON_PROVENANCE.md`。构建日志不应出现 `default Electron icon is used`。

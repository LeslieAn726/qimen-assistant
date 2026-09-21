# AI 今日助手

AI 是可选的语言解释层，不属于排盘引擎。

## 输入

服务端根据目标日期读取并组合：

- 已生成的奇门盘关键数据
- `jieduan.js` 相关规则分析
- 今日计划
- 今日重要事项

浏览器不负责拼接完整 Prompt。当前阶段不自动加入历史记录、最近 7 天、长期记忆、黄历、Obsidian、RAG 或联网搜索结果。

## 输出

Provider 必须返回受验证的 JSON，包括总体建议、优先事项、时间安排、风险提示、计划建议和免责声明。空响应、非 JSON、字段缺失、认证错误、限流和超时都会转换为用户可理解的中文错误。

## Provider 与密钥

`ai/providers/openai-compatible.js` 实现统一 OpenAI-compatible 调用；业务编排位于 `services/ai-service.js`，Prompt 位于 `ai/prompt-builder.js`。

API Key 单独保存在 userData 中的 `ai-settings.json`，文件权限在支持的平台上尽量限制。Key 不进入 Renderer、不写入每日记录、不在 GET 设置响应中返回，也不应出现在日志和错误信息里。

## 数据与费用提醒

用户主动生成建议时，上述输入会发送给所配置的第三方 Provider。其保存期限、训练使用、地域和费用由 Provider 决定。ChatGPT Plus/Pro 订阅不等同于 OpenAI API 额度。

## 免责声明

AI 建议可能不准确。传统术数内容仅作文化和娱乐参考，重要决定应基于可验证事实与专业意见。

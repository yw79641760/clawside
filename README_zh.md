<div style="text-align: center">
  <picture>
    <img src="extension/assets/icons/icon128.png" width="128" alt="ClawSide Logo">
  </picture>
  <h1>ClawSide</h1>
</div>

Chrome 侧边栏扩展，让 OpenClaw 直接进入你的浏览器。选中文本 → 浮动气泡 → 立即获取结果。

## 架构

```
Chrome 页面
  ├─ 浮动气泡（内容脚本）→ 弹出式小窗口显示结果
  └─ 侧边栏（扩展图标）→ 功能完整的独立面板
       ↓ HTTP (chrome-extension → 127.0.0.1:18789)
       OpenClaw Gateway → LLM
```

四种交互模式：
1. **浮动气泡**：选中文本 → 气泡出现 → 点击图标 → 弹出窗口显示结果
2. **径向菜单**：长按气泡 → 打开包含翻译/总结/提问的径向菜单
3. **全局页面翻译**：点击径向菜单中的翻译 → 翻译整个页面并显示加载占位符
4. **完整侧边栏**：点击扩展图标 → 打开完整的翻译/总结/提问/历史界面

## 前置条件

### 启用 OpenClaw HTTP 端点

在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

重启 OpenClaw：
```bash
openclaw gateway restart
```

## 快速开始

1. 打开 Chrome → `chrome://extensions/`
2. 启用**开发者模式** → **加载已解压的扩展程序** → 选择 `extension/`
3. 在任意页面选中文本 → 浮动气泡出现 → 点击图标
4. 或点击扩展图标 → **打开侧边栏**（完整功能）

## 功能

### 浮动气泡（快速操作）
在任意页面选中文本 → 浮动气泡出现 → 点击图标：
- 🌐 **翻译** — 在弹出窗口显示翻译文本
- 📄 **总结** — 在弹出窗口显示页面摘要（如果无现有结果则自动触发）
- 💬 **提问** — 在弹出窗口显示回答

### 径向菜单
长按/右键点击气泡 → 打开包含工具按钮的径向菜单：
- 🌐 翻译
- 📄 总结
- 💬 提问

点击工具会打开侧边栏并切换到对应标签页。

### 全局页面翻译
点击径向菜单中的 🌐 翻译来翻译当前页面的所有段落：
- 为每个段落显示加载占位符
- 每次批量翻译 10 个段落
- 翻译超时时显示错误图标
- 再次点击可隐藏（不会重新请求 LLM）
- 再次点击可重新显示之前的翻译

### 完整侧边栏
点击工具栏中的 ClawSide 扩展图标：
- 🌐 **翻译** — 翻译选中文本，选择目标语言
- 📄 **总结** — 总结当前页面，点击提问图标可跳转到提问并加载上下文
- 💬 **提问** — 提问自定义问题，Ctrl+Enter 发送，每个标签页+URL 保留聊天历史
- 📜 **历史** — 查看所有历史交互，可展开查看详情

### 弹出窗口提问转移
在弹出窗口的提问模式（浮动气泡 💬）中，完成对话后：
- 点击**打开外部**图标（右上角）将聊天历史转移到侧边栏的提问标签页
- 对话可以在完整的侧边栏中继续
- 聊天历史按标签页+URL 保存在本地存储中

### 从总结跳转到提问
在总结结果的头部，点击提问图标可：
- 跳转到提问标签页
- 加载总结结果作为对话上下文
- 自动滚动到输入框

## 故障排除

### "Failed to fetch" / 网络错误
- OpenClaw Gateway 是否在运行？`curl http://127.0.0.1:18789/`
- 配置中是否设置了 `chatCompletions.enabled: true`？
- 修改配置后重启 OpenClaw

### 401 未授权
- 在 ⚙️ 设置中输入你的 gateway token

### 选中文本后气泡不出现
- 重新加载扩展：`chrome://extensions/` → 点击重新加载图标
- 检查控制台错误（内容脚本可能加载失败）

### 流式输出不工作
- 确保在内容脚本中使用 `chrome.runtime.onMessage` 而不是 `chrome.tabs.onMessage`

## 要求

- Chrome 114+（侧边栏 API）
- 本地运行的 OpenClaw Gateway
- `gateway.http.endpoints.chatCompletions.enabled: true`

## Chrome 应用商店

发布到 Chrome 应用商店：
1. 运行 `npm run build` 生成生产版本
2. 压缩 `extension/dist` 文件夹
3. 通过 [Chrome 开发者后台](https://developer.chrome.com/docs/extensions/publish) 上传

## 许可证

[MIT](LICENSE)

## 第三方许可证

- Readability：[Apache 2.0](extension/lib/readability.iife.js)
- marked：[MIT](https://github.com/markedjs/marked)
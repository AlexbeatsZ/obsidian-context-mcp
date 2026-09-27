# 使用、部署与恢复

本次只部署 Windows 的 STEM。插件不连接模型，也不保存模型 API key。

## 启动与读取

1. 打开 STEM，确认状态栏出现“笔记 MCP 已连接”。
2. 在笔记中选中文字，再切到 AI 客户端。
3. 对“解释这里”先调用 `obsidian_get_context`；不知道文件名时先搜索、再读取。
4. 独立客户端配置 `node`，参数为项目的 `dist/mcp.cjs` 绝对路径，工作目录为项目目录。

```powershell
cd C:/Users/Meta/Project/Workspaces/obsidian-context-mcp
npm run mcp
# 下列命令用独立 stdio 客户端完成真正的 MCP 握手和调用。
node scripts/call.mjs list
node scripts/call.mjs obsidian_get_context
node scripts/call.mjs obsidian_read_file arguments.json
```

`arguments.json` 是工具参数对象。服务输出带完整文本 revision；编辑必须沿用
读取结果的 revision 和精确原文。正文行从 1 开始，UTF-16 列从 0 开始。
阅读模式选区只提供渲染文字，不提供虚构源码坐标。

## 审阅

Markdown 编辑候选直接显示在原笔记正文：原行标红、候选行显示在其下方，逐块
“接受 / 拒绝”按钮也在正文中。候选内容不会写入编辑器文档。新建、移动、
重命名、回收和非 Markdown 文本在当前笔记正文顶部显示审阅块；移动涉及的
链接变化按原文／候选逐段展示。没有独立的“待审阅修改”标签页。使用对比图标
或“审阅候选修改”命令可重新打开候选，并在正文工具栏切换提案。

- “接受”立即写入这一块；“拒绝”保留原文。
- 新建、移动、重命名、回收整份确认。移动与涉及的链接修改一起接受。
- 全部接受先检查所有剩余操作，然后依次执行。它不是跨文件原子事务。
- 冲突后重新读取并生成新的提案；已有提案不能强行覆盖新原文。
- 重启后未完成状态恢复。外部客户端通过状态工具查询，不持续轮询。

## 回收与恢复

回收使用本地 `.trash`，引用此文件的笔记保留现有链接。插件还会在项目
`.local/backups` 保存写入前副本，`.local/journals/stem` 保存操作记录。

“恢复已应用修改”按逆序撤回同一提案的已应用步骤。当前内容与提交后的
记录不一致时会停止，保护后来修改。中断步骤只在能精确匹配原文或候选时
自动核对；无法判断时保留副本并提示人工检查。成功恢复后状态为 `restored`，
原提案不能再次应用。

不要覆盖、同步或删除 `.local`，也不要把其中 token、凭据、备份放进 Git。
回收站里的原副本仍保留，便于独立人工恢复。

## 构建、部署与回滚

```powershell
npm ci
npm run check
npm run deploy -- C:/Users/Meta/Documents/Obsidian/STEM
npm run package
# 默认选最早的部署前备份，仅改变本插件的启用状态与安装文件。
npm run rollback
```

部署只复制 `main.js`、`manifest.json`、`styles.css`，保留用户设置和本地提案。
部署备份位于 `.local/deployment-backups`。打包文件位于 `dist`。
首次安装的回滚会关闭本插件；已有插件的回滚恢复备份版本。
执行部署或回滚后在 Obsidian 重新加载，让内存中的插件与文件一致。

## 专用 Tunnel

`.local/tunnel.json` 只保存现有 tunnel-client 路径、凭据源路径、独立 alias 和
专用 tunnel_id。凭据只传给 tunnel-client；MCP 子进程启动前清除凭据及代理。

```powershell
npm run tunnel:start
npm run tunnel:status
npm run tunnel:stop
```

ChatGPT 中的 [Obsidian Context MCP — STEM Windows](https://chatgpt.com/plugins/plugin_asdk_app_6ab8ea1ed0b88191a8ff5e04e29bf2f8)
已连接此专用 Tunnel。元数据变更后刷新工具信息。2026-09-27 的网页聊天
已真实完成读取、候选提交和状态查询；提案仍须在 Obsidian 本地接受。连接中
没有接受、恢复、命令执行或任意本机文件访问工具。

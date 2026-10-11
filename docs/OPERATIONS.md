# 使用、部署与恢复

Windows 和 macOS 分别部署各自本机的 STEM。插件不连接模型，也不保存模型 API key。

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

## Windows 桌面客户端

本机 Antigravity Desktop 和 Claude Desktop 使用本地 stdio 服务，复用同一
Windows STEM 插件及配对，不需要启动 ChatGPT Tunnel。2026-10-06 在 META-OMEN
安装的服务名为 `obsidian-context-stem-windows`，配置如下：

```json
{
  "command": "C:/Users/Meta/scoop/apps/nodejs-lts/current/node.exe",
  "args": ["C:/Users/Meta/Project/Workspaces/obsidian-context-mcp/dist/mcp.cjs"],
  "env": {
    "OBSIDIAN_MCP_PROJECT": "C:/Users/Meta/Project/Workspaces/obsidian-context-mcp"
  }
}
```

将此对象作为已有 `mcpServers` 的一个条目合并，保留其余服务器和设置。
`OBSIDIAN_MCP_PROJECT` 必须显式设置，桌面客户端的启动目录通常不是项目目录。
Node 使用本机已有绝对路径；不需要安装全局依赖或复制配对 token。

- Antigravity Desktop 2.19.1：`C:/Users/Meta/.gemini/config/mcp_config.json`。
  本机 `.gemini/antigravity/mcp_config.json` 是指向此文件的符号链接。
  `.gemini/antigravity-ide` 属于另一安装，不作为本次桌面版配置目标。
- Claude Windows Store 2.19675.1.0：
  `C:/Users/Meta/AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/claude_desktop_config.json`。
  `~/.claude.json` 属于 Claude Code，不是 Desktop 配置。

保存后启动或完整重启桌面客户端，并保持 Obsidian 的 STEM 打开。
Claude 的 `C:/Users/Meta/AppData/Local/Claude/logs/main.log` 应出现
`Connected to obsidian-context-stem-windows (6 tools)`。
Antigravity 本机工具定义在 `.gemini/antigravity/mcp/obsidian-context-stem-windows/`；
应发现六个工具及服务器说明，并核对实际 MCP 进程属于桌面版 language server。
独立 MCP 握手与 `obsidian_get_context` 可以验证配置命令和 Obsidian 连接；
这与桌面客户端自身加载工具是两个检查层级。

安装前配置保存在忽略的 `.local/desktop-client-backups/20261006/`，只读验证
记录在 `.local/qa/desktop-clients-20261006.json`。回滚优先仅删除两边
`mcpServers.obsidian-context-stem-windows`，再重启客户端，保留后来修改的其他设置。
所有候选仍需在 Obsidian 本地接受；没有新增直接写入或远程接受能力。

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

ROG 于 2026-10-07 安装 Obsidian 1.14.4，程序在
`C:/Users/Meta/AppData/Local/Programs/Obsidian/Obsidian.exe`，打开本机已有 STEM。
ROG 的 `.local/config.json`、端点、提案和恢复记录由本机生成，不复用 OMEN。
本机候选接受滚动修复已部署并通过真实按钮验收；本轮没有配置 ChatGPT Tunnel。
接受现在只更新变化的文字，并在决定和候选块收起期间保留当前编辑器的滚动
锚点。单次审阅结束会收起工具栏；显式打开审阅或切换文件仍会导航至候选。

macOS 在 `/Users/meta/Project/Workspaces/obsidian-context-mcp` 执行相同的
`npm ci`、`npm run check`、`npm run package`，以
`npm run deploy -- /Users/meta/Documents/Obsidian/STEM` 部署。Mac 的 `.local`
独立保存配对、提案和恢复副本；不要从 Windows 复制。`node scripts/call.mjs list`
与 `node scripts/call.mjs obsidian_get_context` 用于本机 MCP 验证。

## 专用 Tunnel

`.local/tunnel.json` 只保存现有 tunnel-client 路径、凭据源路径、独立 alias 和
专用 tunnel_id。凭据只传给 tunnel-client；MCP 子进程启动前清除凭据及代理。

```powershell
npm run tunnel:start
npm run tunnel:status
npm run tunnel:stop
```

如果 ChatGPT 报 `McpServerError: Session terminated`，或连接探测返回 404 / 429，先在对应机器的项目
目录运行 `npm run tunnel:status`。若为 `stopped`，运行
`npm run tunnel:start`，再请 ChatGPT 重试原调用。本机可用
`node scripts/call.mjs obsidian_get_context` 区分 Tunnel 中断与 Obsidian
插件离线。`ready` 仅表示 runtime 已连接，仍要用一次真实 ChatGPT 工具调用
确认恢复。未安装自动恢复的主机仍需按需启动；Windows META-OMEN 已于
2026-10-11 安装下面的自动恢复任务。

2026-10-07 的 Windows 故障中，真实连接探测返回 OpenAI 网关的 429，但本机
stdio 仍能读取笔记；停止的 Tunnel 重新启动后，同一远端工具立即成功。
因此不能仅凭此错误码判定模型额度耗尽。先区分本机 stdio、Tunnel 进程与
远端工具调用；若 Tunnel 已经 `ready`，保留具体错误并避免连续重试。

### Windows 登录自启与退出后恢复

在有本机 `.local/tunnel.json` 的 Windows 项目中执行：

```powershell
npm run tunnel:autostart:install
npm run tunnel:autostart:status
# 手动运行一次检查，不注册或修改任务。
npm run tunnel:ensure
# 移除自动启动任务，保留连接、凭据及配对。
npm run tunnel:autostart:uninstall
```

安装使用当前用户计划任务 `Obsidian Context MCP Tunnel`，登录时检查一次，
此后每分钟持续检查。使用本机绝对 Node / 项目路径，隐藏运行，允许电池
供电，不提权也不保存登录密码。已有进程正常运行时保持它；只有该专用
Tunnel 的进程停止才重连，网络短暂未就绪仍交给原 poller 自行恢复。

`npm run tunnel:stop` 会先写 `.local/tunnel-auto-paused` 再停止连接，暂停自动
恢复，且暂停跨重启保留。`npm run tunnel:start` 清除暂停并恢复连接。
只移除任务不会断开当前连接；需要完全停用时先执行 stop，再卸载任务。
项目或 Node 路径变化后重新安装任务。运行仍需要登录用户以及可用的网络、
凭据和打开的本机 STEM。任务状态和 Tunnel ready 仍不能代替真实远端工具验收。

自动检查只在恢复或失败时写项目忽略目录的 `.local/tunnel-supervisor.log`，
超过 512 KiB 保留一份轮转，不记录 CLI 原始输出或凭据。生命周期约定见
[设计说明](design/tunnel-runtime.md)。META-OMEN 受控结束进程后约 61 秒自动
恢复，手动暂停／恢复及真实远端读取已通过；本轮未注销或重启整机。

ChatGPT 中的 [Obsidian Context MCP — STEM Windows](https://chatgpt.com/plugins/plugin_asdk_app_6ab8ea1ed0b88191a8ff5e04e29bf2f8)
已连接此专用 Tunnel。元数据变更后刷新工具信息。2026-09-27 的网页聊天
已真实完成读取、候选提交和状态查询；提案仍须在 Obsidian 本地接受。连接中
没有接受、恢复、命令执行或任意本机文件访问工具。

Mac 使用独立 Tunnel `tunnel_6ab9425b741081919d5a7ba1f10a3641`、
`obsidian-context-stem-mac` alias 和
[Obsidian Context MCP — STEM Mac](https://chatgpt.com/plugins/plugin_asdk_app_6ab943060aa48191960e218b3fc67cd6)。
配置保存在 Mac 项目的 `.local/tunnel.json`；`client` 指向本机已有的
`tunnel-client`，`credential_source` 指向本机已有凭据源，`tunnel_id` 为上面的
独立 ID。用 `npm run tunnel:start/status/stop` 管理。运行凭据只传给
Tunnel client，`scripts/start-mcp.mjs` 启动 MCP 前清理凭据及代理。

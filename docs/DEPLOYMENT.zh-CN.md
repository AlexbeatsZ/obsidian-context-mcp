# 从零部署：让 ChatGPT Web 使用你的 Obsidian

适用本项目 0.2.1，文档核对日期：2026-10-28。主线为 **Windows / macOS 桌面 Obsidian + 本机 MCP + 每人自己的 OpenAI Secure MCP Tunnel**。命令里的路径和 ID 都要替换成你自己的值。

## 1. 先理解需要装在哪

Obsidian 插件、MCP 桥和 tunnel-client 应运行在**打开目标 Vault 的同一台电脑上**。浏览器可以在别处，但这台电脑必须保持唤醒、联网并打开该 Vault。

```text
ChatGPT Web
  ↕ OpenAI 的 Tunnel 服务（出站 HTTPS）
你的电脑：tunnel-client → stdio MCP 桥 → 127.0.0.1 插件 → Vault
                                                    ↑
                                          你点击接受／拒绝
```

不需要域名、VPS、路由器端口映射，也不需要把笔记整体上传到一个共享服务器。工具调用返回的笔记内容仍会发送给 ChatGPT；具体范围见[数据与权限](PRIVACY.md)。每位使用者独立部署，不能把维护者或朋友的 `.local` 目录拿来复用。

## 2. 准备条件

| 项目 | 要求和检查 |
| --- | --- |
| Obsidian | 桌面 1.12.0 及以上，能启用社区插件；先打开一次目标 Vault，产生标准 `.obsidian` 目录 |
| Node.js | 22+，建议 24 LTS；`node --version`、`npm --version` 能运行 |
| ChatGPT | 自己账号／目标工作区能创建开发者模式自定义连接；权限由实际账号和管理员策略决定 |
| OpenAI Platform | 自己的组织可使用 Tunnels，能取得自己的 tunnel_id 与 runtime API key |
| 网络 | 本机可出站访问 OpenAI；企业网络按官方 Tunnel 网络要求配置 |
| 文件位置 | 一个固定本机项目目录对应一个 Vault；项目目录放在 Vault 外，不随笔记同步 |

只有本地 stdio 客户端时无需云端凭据。不要因为插件不调用模型 API，就认为 Tunnel 不需要运行凭据；也不要把 ChatGPT 订阅与 Platform 权限视为同一项。

**先检查云端入口，再投入部署时间。**打开[自己的 Tunnels 设置](https://platform.openai.com/settings/organization/tunnels)，以及 ChatGPT 的设置／Plugins／Apps 相关入口。若没有 Tunnel 或开发者模式权限，先找组织／工作区管理员处理；本项目不能解锁账号功能，也没有内置公网 HTTP 替代连接。

如果缺 Node.js：Windows 使用 Scoop 的用户可执行 `scoop install nodejs-lts`；macOS 使用 Homebrew 的用户可执行 `brew install node@24`，并按 Homebrew 输出处理命令路径。这些是用户自行决定的系统／用户级软件安装，本项目部署脚本不会代为安装或改 PATH。已有符合要求的 Node.js 可直接使用。

## 3. 取得程序：二选一

### A. 下载现成桌面包（适合使用者）

从[Releases](https://github.com/AlexbeatsZ/obsidian-context-mcp/releases/latest)下载 `obsidian-context-mcp-desktop-0.2.1.zip` 或更新版本。不要选 GitHub 自动生成的 Source code ZIP，也不要只下载三文件插件 ZIP。

解压到固定目录，例如：

- Windows：`C:\Users\你的用户名\Project\Workspaces\obsidian-context-mcp`
- macOS：`/Users/你的用户名/Project/Workspaces/obsidian-context-mcp`

确保该目录下直接有 `package.json`、`main.js`、`dist/mcp.cjs`、`dist/call.cjs` 和 `scripts/`，不要误停留在外面多嵌套的一层目录。此包**不需要 `npm ci` 或 `npm install`**。Node.js 本身仍需安装。

Windows：在资源管理器打开这个目录，在地址栏输入 `powershell` 并回车。macOS：在终端 `cd` 到该目录。之后除特别说明，所有命令都在该目录执行。

### B. 从源码构建（适合开发者）

```sh
git clone https://github.com/AlexbeatsZ/obsidian-context-mcp.git
cd obsidian-context-mcp
npm ci
npm run check
npm run package
```

依赖只安装在此项目的 `node_modules`。无须 `npm -g`，也不需要 OpenAI 模型 API key 来运行测试或构建。构建完留在该项目目录继续。

## 4. 安装到自己的 Vault 并验证本地连接

第一次可先创建一个仅有测试笔记的 Vault。确认它使用默认 `.obsidian` 配置目录；本版脚本尚不支持改名后的配置目录。

Windows PowerShell 示例（替换路径）：

```powershell
npm run setup -- --vault "D:/Notes/My Vault"
```

macOS 示例（替换用户名与路径）：

```sh
npm run setup -- --vault "/Users/yourname/Documents/My Vault"
```

此命令复制插件三文件，备份先前版本，创建本项目 `.local/config.json` 并把本插件加入启用列表，保留其他插件。它不会改笔记正文，也不会启动 Tunnel。新安装内部 ID 默认 `notes`；旧安装的 `stem` 等 ID 保持不变，不要手工迁移 ID。

在 Obsidian：

1. 打开目标 Vault → 设置 → 第三方／社区插件，按 Obsidian 提示启用社区插件。
2. 启用 **Obsidian Context MCP**。
3. 打开此插件的设置，将“本机项目目录”填成刚才解压／clone 的项目**绝对路径**，无需包住引号。路径应指向有 `package.json` 的目录，不能指向 Vault 或 `.obsidian/plugins`。
4. 关闭再开启此插件，或完整重新加载 Obsidian。修改路径不会在当前已运行实例中自动重连。
5. 打开一篇 Markdown 笔记，选中一段文字。状态栏应出现“笔记 MCP 已连接”。

再执行：

```sh
npm run doctor
npm run tools
npm run context
```

`doctor` 应全部为 `OK`，发现六个工具并成功访问插件。它只打印检查结论，不打印笔记正文；`context` 会打印实际笔记上下文，只在自己的终端查看。没有当前选区时也可以连接，先回笔记里实际选中文字再切换浏览器。

如因 PowerShell 执行策略导致 `npm.ps1` 被阻止，可将命令的 `npm` 换成 `npm.cmd`，无需修改系统执行策略。

## 5. 准备你自己的 OpenAI Tunnel

按 [OpenAI Secure MCP Tunnel 官方说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)在 Platform 创建／选择**你自己的** Tunnel。管理页：[Tunnels](https://platform.openai.com/settings/organization/tunnels)。记录完整 `tunnel_id`。

- 创建或修改 Tunnel 需要组织授予 Tunnels Read + Manage。
- 运行客户端和在 ChatGPT 中选择 Tunnel 需要 Tunnels Read + Use。
- 在 Tunnel 配置中关联实际要使用它的 ChatGPT 工作区；仅关联 Platform 组织并不保证它会在另一工作区中显示。
- 使用自己的 runtime API key，入口可见[官方客户端的 onboarding](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md)。长期运行时不要用 admin key，也不要索取维护者的 key。

本项目只使用凭据连接 Tunnel 控制面，不调用模型 API。账号可用性和费用以自己的产品／组织政策为准，本文不承诺免费、固定套餐或自动获得权限。

从自己的 Platform Tunnels 页下载客户端，或访问 [OpenAI tunnel-client 最新 Release](https://github.com/openai/tunnel-client/releases/latest)。下载**普通 `tunnel-client`**、对应系统和 CPU 的 ZIP，解压至本项目 `.local/tools/tunnel-client/`。不要误选 `runtime-cloudflared` 或源码包。

| 电脑 | 选择资产名中的后缀 |
| --- | --- |
| 普通 Windows Intel/AMD | `windows-amd64.zip` |
| Windows ARM | `windows-arm64.zip` |
| Apple Silicon Mac | `darwin-arm64.zip` |
| Intel Mac | `darwin-amd64.zip` |

客户端不随本项目再分发，不需要全局安装、加入 PATH 或使用 Codex。2026-10-18 最新发布为 v0.0.16，后续以官方最新版本为准；本项目 wrapper 使用 `runtimes connect/status/disconnect` 命令族。

找到实际可执行文件位置后检查（不同 ZIP 可能有内层目录）：

```powershell
# Windows：按实际解压位置修改
& "C:/path/to/obsidian-context-mcp/.local/tools/tunnel-client/tunnel-client.exe" --version
& "C:/path/to/obsidian-context-mcp/.local/tools/tunnel-client/tunnel-client.exe" runtimes connect --help
```

```sh
# macOS：按实际解压位置修改；只对下载的这一个文件添加可执行权限
chmod u+x "/path/to/obsidian-context-mcp/.local/tools/tunnel-client/tunnel-client"
"/path/to/obsidian-context-mcp/.local/tools/tunnel-client/tunnel-client" --version
"/path/to/obsidian-context-mcp/.local/tools/tunnel-client/tunnel-client" runtimes connect --help
```

如果系统阻止运行，先确认下载来源确实是官方仓库／Platform 页，按系统自身提示处理，不关闭系统安全功能。上面运行不成功时先解决客户端路径或系统兼容问题。

## 6. 生成本机 Tunnel 配置并启动

Windows 示例：

```powershell
npm run tunnel:configure -- --client "C:/path/to/tunnel-client.exe" --tunnel-id "tunnel_替换为自己的完整ID" --alias "obsidian-my-notes"
notepad .local/tunnel.env
```

macOS 示例：

```sh
npm run tunnel:configure -- --client "/absolute/path/to/tunnel-client" --tunnel-id "tunnel_替换为自己的完整ID" --alias "obsidian-my-notes"
open -e .local/tunnel.env
```

配置命令不会远程创建 Tunnel，也不会启动连接；它生成忽略 Git 的 `.local/tunnel.json` 和凭据模板。已有配置会拒绝覆盖。`--alias` 在本机应独一无二；同机多个项目用不同 alias。

在本地编辑器中把 `REPLACE_WITH_YOUR_RUNTIME_KEY` 换成自己的 runtime key：

```dotenv
CONTROL_PLANE_API_KEY=你的实际runtime-key
# 只有出站网络确实需要代理时才设置这一项，端口按自己的代理修改：
# TUNNEL_HTTP_PROXY=http://127.0.0.1:7890
```

保存为 UTF-8。不要把真实 key 写进命令行、聊天、截图、issue 或公共示例。需要复用自己的已有 env 文件时，配置命令支持 `--credential-source "/absolute/path/to/your-private.env"`，兼容旧的 `OPENAI_API_KEY` 变量名；推荐新配置使用 `CONTROL_PLANE_API_KEY`。

```sh
npm run tunnel:start
npm run tunnel:status
```

确认 runtime 为运行中且 ready。启动前会拒绝空白／占位 key。不要同时用两个进程启动相同 alias；不要在另一台设备复用同一份 `.local` 或同一个正在使用的 Tunnel 身份。`tunnel:start` 使用客户端原生托管 runtime，不要求当前终端一直打开；关闭电脑或退出 runtime 后远端就不可用了。

## 7. 在 ChatGPT Web 创建连接

1. 切换到需要使用笔记的正确 ChatGPT 账号／工作区。
2. 按当前 ChatGPT 界面启用开发者模式；企业／学校工作区可能先要管理员授权。
3. 在 Plugins／Apps 的自定义连接入口创建开发者模式应用，命名例如 **My Obsidian**。
4. Connection 选择 **Tunnel**，选择自己的 Tunnel 或填入完整 ID。不要填 `localhost`、Vault 路径或维护者 ID。
5. 按界面保存／安装／连接，并检查列出的工具正好是本项目的六个工具。这个 stdio 服务没有单独的 OAuth 登录页；不需要给本地 HTTP listener 配公开地址。
6. 新建或回到对话，启用／选中 **My Obsidian**。只安装连接而不在对话启用，并不保证会调用。

界面名称可能随产品版本变化；准确入口以[官方连接说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)和自己账号实际界面为准。找不到 Tunnel 时检查组织权限、工作区关联、当前账号，不要复制别人已安装的连接链接。

## 8. 做一次完整验收

在测试 Vault 中先手工创建 `MCP验收.md`，写入两段无敏感内容的文字，保持该笔记打开。

**读取：**选中一句话后切到 ChatGPT，发送：

> 使用 My Obsidian，调用 obsidian_get_context，告诉我当前笔记路径和选中的原文，然后解释这句话。

核对返回路径、选区是否与实际一致。再让它搜索一个自己刚写的关键词，并读取该笔记。

**候选修改：**发送：

> 请读取 MCP验收.md，将第一段改写得更清楚。只提交候选修改，保留公式和原意，等待我回到 Obsidian 审阅。

应在 Obsidian 笔记正文出现红／绿候选 diff。**尚未点击接受前，原正文不能已经变成候选文字。**先拒绝一块，再提交另一份候选并接受一块。让 ChatGPT 在你决定后调用 `obsidian_get_change_status`，核对实际状态。它不会自动得知你的点击，不应持续轮询。

需要验证新建时发送：

> 请提出新建 MCP测试/hello.md 的候选，内容为“Hello Obsidian MCP”，不要尝试绕过本地审阅。

本地接受后应出现文件；拒绝则不应出现。测试回收／恢复只使用自己创建的测试文件。恢复是本地工具栏“撤销已接受”动作，可能因后续重叠修改而停止；先保留副本，不要为排障清空恢复日志。

完成这些才算你这台电脑、这个 Vault 和这个 ChatGPT 工作区的端到端验收。`npm run check`、六工具 discovery 或 Tunnel ready 各自只证明其中一层。

## 9. 可选：其他本地 MCP 客户端

支持 stdio 的客户端可合并以下条目到自身 `mcpServers`，替换两个路径，保留现有服务器。无需启动 Tunnel：

```json
{
  "mcpServers": {
    "obsidian-notes": {
      "command": "C:/absolute/path/to/node.exe",
      "args": ["C:/absolute/path/to/obsidian-context-mcp/dist/mcp.cjs"],
      "env": {
        "OBSIDIAN_MCP_PROJECT": "C:/absolute/path/to/obsidian-context-mcp"
      }
    }
  }
}
```

macOS 用 `command -v node` 确认自己的 Node 可执行路径，把上述路径改成 `/...` 格式。`OBSIDIAN_MCP_PROJECT` 必须明确指定，客户端工作目录往往不是本项目。重启客户端并执行实际读取测试。所有客户端共享本机插件的审阅边界。

## 10. 日常使用、启动、更新与回滚

- 使用前：打开 Vault → `npm run doctor` → `npm run tunnel:start` → `npm run tunnel:status` → ChatGPT 中实际调用。
- 暂停远端：`npm run tunnel:stop`。本地 stdio 客户端仍可使用已开启的 Obsidian 插件。
- Windows 可自行选择登录启动：`npm run tunnel:autostart:install`；检查 `npm run tunnel:autostart:status`；移除 `npm run tunnel:autostart:uninstall`。它创建当前用户计划任务，安装时也启动连接；只有登录触发，不周期轮询、不自动重启进程、不启动 Obsidian。不要以管理员身份运行。
- Windows 可自行创建桌面恢复入口：`npm run tunnel:shortcut`。只在同名快捷方式属于此项目时更新。
- macOS 暂无本项目的一键 launchd 安装脚本。登录后手工执行 `tunnel:start`；不要把 Windows 的计划任务命令照搬过去。
- 同一台电脑多个 Vault：为每个 Vault 使用独立项目目录、alias、Tunnel。Windows 自启任务和桌面快捷方式名称当前固定，仅支持一套此入口；多 Vault 不要反复安装同名任务，可手动启动各自 Tunnel。

**更新源码安装：**先处理当前提案，停用插件并停止 Tunnel，再在原项目 `git pull --ff-only`、`npm ci`、`npm run check`，最后 `npm run setup -- --vault "原Vault路径"`。保留 `.local`，启用插件、重新执行 doctor 并启动连接；工具 schema 变化后在 ChatGPT 刷新元数据。

**更新桌面 ZIP：**先处理提案，停用插件并停止 Tunnel，再把新 ZIP 解压覆盖到**原项目目录**，保留 `.local`，执行相同 setup、重载、doctor、start 流程。不要把 `config.json` 改到另一 Vault 来冒充升级，也不要把整个旧目录删掉。移动项目后需重新配置 Obsidian 项目路径及客户端／Tunnel 启动绝对路径，Windows 自启和快捷方式也需更新。

**回滚插件部署：**停用插件后执行 `npm run rollback`，默认恢复最近一次部署前备份，仅调整本插件文件和它自身的启用状态，保留之后添加的其他插件。指定备份可用 `npm run rollback -- "备份目录名"`。然后重新加载 Obsidian；完整版本回退还要恢复同版本 MCP 桥和脚本，不能把旧插件与任意新桥混用。`rollback` 不撤销已接受的笔记改动。

首次安装的回滚会把本插件从启用列表去掉，可能保留磁盘上的三文件；`.local` 仍保留以便恢复。完整停用方法见[数据与权限](PRIVACY.md)。

## 11. 常见问题

| 现象 | 检查顺序 |
| --- | --- |
| setup 提示找不到 `.obsidian` | 确认是 Vault 根目录，先在 Obsidian 打开一次；改名后的配置目录暂不支持 |
| setup 提示 already paired | 原项目已有另一 Vault 或内部 ID；新建独立项目目录，保留旧 `.local` |
| 没有“笔记 MCP 已连接” | 核对插件设置的本机项目绝对路径，检查 `.local/config.json` 的 root，重载插件 |
| doctor 握手成功但插件不可达 | 打开目标 Vault，检查插件是否启用及所用项目目录；仅有 build 产物不代表插件在运行 |
| context 没有选区／显示旧笔记 | 回笔记实际点击／选中文字，再切浏览器；审阅导航不会冒充用户活动 |
| Tunnel key 错误／401／403 | 本地编辑 env；确认是 runtime key，具有目标组织 Read + Use，未撤销且属于正确组织 |
| Tunnel 在 ChatGPT 列表不可见 | 核对当前账号、工作区关联、权限；本地 ready 不会授予云端权限 |
| Session terminated／远端探测 404、429 | 先 doctor，再 status；stopped 时 start，最后重试一次真实调用。不要只凭状态码认定配额或代理问题 |
| status 仍不 ready | 使用客户端自己的 `--help` 和 `help quickstart`，检查网络／代理及本机 runtime 状态；避免连续重启或反复发请求 |
| 接受按钮冲突 | 先确认笔记后续是否改过，重新读取并生成候选；不覆盖当前内容硬套旧 revision |
| 候选可见但工具栏不见 | 命令面板“显示当前笔记的审阅栏”；检查 `.local/ui-errors.log`，先去除敏感信息再报告 |
| Windows 重启后失联 | 确认是否自愿安装了登录任务、已登录且 Obsidian 打开；无登录启动时手工 start |
| 手机打不开插件 | manifest 标记桌面专用；可在手机使用 ChatGPT，但后端桌面仍须在线，本地审阅要回桌面 |

报告问题时提供操作系统、Node/Obsidian/插件/tunnel-client 版本、失败层级和去敏的错误。不要提交 key、endpoint token、`.local` 压缩包或真实笔记正文。

## 官方参考

- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)：网络、账号、权限、ChatGPT 关联。
- [官方 tunnel-client onboarding](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md)：运行 key 入口和 `runtimes` / `init` / `run` 区别。
- [官方 tunnel-client permissions](https://github.com/openai/tunnel-client/blob/master/docs/permissions.md)：角色与运行权限。
- [官方 tunnel-client Releases](https://github.com/openai/tunnel-client/releases/latest)：不同平台客户端。

本教程的脚本行为来自仓库实现。历史真实运行经验不替代新用户在自己设备上的验收；见[分发与验证范围](DISTRIBUTION.md)。

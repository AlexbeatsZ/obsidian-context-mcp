# 给其他人使用：分发方案与维护

研究日期：2026-10-18；当前版本：0.2.1（2026-10-28）。仓库采用 MIT License。

## 当前选择

**发布源码和完整桌面部署 ZIP，让每位使用者连接自己的 Obsidian、自己的 OpenAI Tunnel 和 ChatGPT 工作区。**这种方式保留现有审阅设计，部署无需你运营服务器或拿到别人的笔记与密钥。

仓库公开使别人能够下载与修改源码；它不使你的现有 Tunnel 或 Vault 变成公共服务。请分享仓库、Release 和部署教程，不要分享 `.local` 或你的私人 ChatGPT 连接。

## 几种方式的区别

| 路线 | 使用者需要什么 | 本项目状态 | 适用范围 |
| --- | --- | --- | --- |
| 本地 stdio MCP | 本机 Node、Obsidian、支持 stdio 的 AI 客户端 | 已实现 | Claude Desktop、Codex 等；不直接解决 ChatGPT Web 连接 |
| 每人自建 Secure MCP Tunnel | 上述本机组件、tunnel-client、自己的 Platform/Tunnel 与 ChatGPT 权限 | 本次公开分发主线 | 可接受一次手动配置的个人使用者、小范围分享 |
| 公网 HTTPS MCP | 域名、TLS、远端 MCP 传输与身份认证，或受保护的转发网关 | 未实现 | 没有 Tunnel 权限但具备远程 MCP 接入条件的使用者，需要另外设计 |
| 公共 ChatGPT 插件目录 | 符合公开提交流程的端点、认证、隐私说明、审查与持续运维 | 未提交 | 面向大众安装的产品，不能只上传本仓库 ZIP 实现 |
| Obsidian 社区插件目录 | 提交插件审核并维护发布资产 | 未提交 | 只简化插件安装；仍需要 MCP 桥与 ChatGPT 连接 |

OpenAI 当前官方说明明确区分私人 Tunnel 接入和公共插件分发：Tunnel 支持私人连接／开发者模式测试；公开插件需要稳定、可公开访问的 HTTPS MCP 端点。[官方 Tunnel 说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

因此，**“开源让每个人自行部署”已经可以交付；“任何人点安装就用”仍是另外的产品工程**。

## 为什么暂不提供共享服务器

本机桥使用 stdio 连接到本机插件的认证 HTTP RPC，真实编辑器状态和审阅按钮属于桌面进程。把这个目录复制到 VPS，不会得到远端桌面的选区与审阅能力。公网反代 `/rpc` 也不是一个标准的远程 MCP 服务。

若以后做公共产品，需要新增面向外部客户端的标准远程 MCP 传输、用户认证、Vault／设备路由、每用户会话隔离、撤销连接和限流，以及桌面代理与云端的受控通道。备份、候选正文、日志也必须按使用者隔离。这些是基于当前代码边界的后续设计要求，当前仓库没有实现或声称提供这些能力。

## 0.2.0 分发内容

- 新用户 `setup --vault` 支持自选 Vault，默认内部 ID `notes`；旧安装保留 `stem` 等原 ID 和全部本地恢复状态。
- 首次没有 `community-plugins.json` 时可初始化；绑定了其他 Vault 时拒绝覆盖；保留无关插件条目。
- `tunnel:configure` 生成忽略 Git 的配置与 env 模板，不创建云端身份，不覆盖已有配置，不打印凭据。
- `doctor` 分别检查产物、安装、六工具握手、本地插件连通，不把这些等同于 ChatGPT 端到端验收。
- 完整桌面 ZIP 包含已打包 `dist/mcp.cjs` 与 `dist/call.cjs`、插件、部署／运行脚本、教程、许可。无需在使用者电脑安装 npm 依赖。
- 插件 ZIP 只有 `main.js`、`manifest.json`、`styles.css` 和许可说明，不含 MCP 桥。两个包都通过白名单打包，不含 `.local`、笔记、凭据、node_modules 或 tunnel-client。
- Windows 的登录启动、桌面快捷方式保留；macOS 手工启动；不在此版本新增后台监控。

## 维护者发布步骤

1. 同步 `package.json`、lockfile 根版本、`manifest.json`、`src/mcp.ts` 中服务版本和 API／教程版本。
2. `npm ci`，`npm run check`，`npm run package`。构建会为插件、桥和诊断客户端生成 bundle 元数据；打包据此生成 `THIRD_PARTY_NOTICES.md`，附上打包依赖的许可。
3. `node --import tsx --test tests/distribution.smoke.ts`：将 ZIP 解压到独立临时目录，核对无本机状态，不使用 node_modules，实际握手、读取、提交候选与查询状态。这个测试使用模拟插件服务，不是 Obsidian UI 验收。
4. 提交和推送，确认 Windows、macOS、Linux 的 CI 结果；失败时先修复，不能从本地 Windows 成功推断其他系统已过。
5. 创建版本 tag 和 GitHub Release，上传两个 ZIP 和插件三文件。Release 说明写出验证层级与限制。
6. 真实桌面新部署需按[教程第 8 节](DEPLOYMENT.zh-CN.md#8-做一次完整验收)另验；不能把 CI 结果写成所有设备实际可用。

CI 仅使用项目依赖和临时 Vault，不需要真实笔记、OpenAI key 或 Tunnel secret。不要将真实用户状态加入 Actions secret 以执行这套测试。

## 验证记录

旧版维护者环境曾通过 Windows 本地审阅和 ChatGPT 的真实读取／候选／状态调用；Mac 曾通过本地和 Web 工具调用，但本地按钮审阅与恢复没有同等验收记录。原有具体记录见 [ACCEPTANCE](https://github.com/AlexbeatsZ/obsidian-context-mcp/blob/main/docs/ACCEPTANCE.md)。这些属于旧版本历史证据。

0.2.0 已于 2026-10-18 [公开发布](https://github.com/AlexbeatsZ/obsidian-context-mcp/releases/tag/v0.2.0)。发布 commit `e89d0e7` 的 [Windows、macOS、Ubuntu CI](https://github.com/AlexbeatsZ/obsidian-context-mcp/actions/runs/39062809946) 全部通过：57 项测试、类型检查、构建、打包及独立解压包 smoke test。本机 doctor 也已连接现有真实插件。本次未重做真实 ChatGPT Web 或本地 UI 点击审阅验收。

自动化测试涵盖首次部署、旧身份保留、错误 Vault 拒绝、回滚保留无关配置、配置不覆盖、占位凭据阻断及脱离 node_modules 的完整部署包握手。真实用户的账号权限、网络、桌面 UI 和点击接受需在其自己的设备上验证。

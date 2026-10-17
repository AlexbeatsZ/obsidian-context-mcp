# 数据、权限与本地状态

本插件把所选 Obsidian 桌面 Vault 的上下文提供给你连接的 MCP 客户端。它本身不调用模型 API。使用 ChatGPT 时，工具返回的笔记正文、选区、文件路径、附近文字、打开／最近／链接笔记信息和提案状态可能进入 ChatGPT 对话，适用你所用账号、工作区和 OpenAI 产品的数据政策。Tunnel 保持本地服务不公开，不表示笔记内容不会送往云端。

## 暴露的能力

远端只有六个工具：上下文、文件列表、搜索、读取、提交候选修改、查询状态。能读取已配置 Vault 中允许的文件，并不限于当前选中的一段。没有逐文件授权界面；对敏感内容应使用单独的测试／分享 Vault。

工具不提供 shell、任意本机路径访问、跨 Vault 操作、直接接受或恢复修改。隐藏／配置路径和符号链接被排除。附件只返回元数据，支持候选移动、重命名与回收，不上传二进制内容。

候选编辑、新建、移动和回收要在 Obsidian 本地决定。接受某块会立即写入；“全部接受”依次执行，不能保证跨文件原子性。移动会包含被审阅的链接修改。回收走本地 `.trash`。冲突检查使用当前编辑器文字与 revision；后续独立修改可能阻止接受或恢复。

## 本机文件

| 位置 | 用途 |
| --- | --- |
| 项目 `.local/config.json` | 绑定 Vault 的本机真实路径和内部 ID |
| `.local/endpoints/` | 当前端口及每次插件加载时轮换的配对 token |
| `.local/proposals/` | 候选正文、决定、revision |
| `.local/journals/`、`.local/backups/` | 写入日志与恢复副本，可能包含完整笔记正文 |
| `.local/deployment-backups/` | 插件部署前版本及启用列表 |
| `.local/tunnel.json`、`.local/tunnel.env`、`.local/tunnel/` | Tunnel 本机配置、运行凭据与配置文件 |
| `.local/ui-errors.log` | 审阅 UI 错误栈；提交 issue 前检查路径与敏感信息 |

这些状态不应放进 Vault 同步、Git 或分发包。`.gitignore` 排除整个 `.local/`；发布脚本使用文件白名单，不包含它。每台电脑独立创建配对、Tunnel 和凭据。Windows env 文件继承当前用户目录的 ACL；POSIX 新建凭据文件请求 `0600` 权限。程序未提供系统钥匙串加密存储。

Tunnel runtime key 只交给 `tunnel-client`；MCP 子进程会清除 OpenAI 密钥与代理环境变量。默认本地 listener 只绑定 `127.0.0.1` 并校验 bearer token，拒绝浏览器 Origin 请求。仍应保护项目目录和本机账户；它不是对本机管理员或同账户恶意进程的隔离边界。

## 停用和清理

先在 ChatGPT 断开／卸载你的连接，再执行 `npm run tunnel:stop`。已启用 Windows 登录启动的，执行 `npm run tunnel:autostart:uninstall`，随后在 Obsidian 停用插件。需要撤销 runtime key 时到自己的 OpenAI Platform 操作。

停用插件不会删除 `.local`。请先处理／恢复未完成提案，确认无需恢复副本后再自行删除本项目目录。不要因排障直接删除 `.local` 或从另一台电脑覆盖它。

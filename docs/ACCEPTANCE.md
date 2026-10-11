# Windows STEM 验收记录

## OMEN 本机连接恢复（2026-10-07）

用户急需恢复本机 MCP。独立 stdio 客户端成功返回当前笔记
`02笔记/化学/化学动力学/01传递过程和非平衡态热力学.md`，源码选区为
第 50 行、UTF-16 列 6–8 的“系数”；同时 Windows 专用 Tunnel 状态为
`stopped`。执行 `npm run tunnel:start` 后复查为 `ready`，再次调用本地
上下文仍返回相同笔记和非空选区。没有重载插件、修改配置或写入笔记。

本次确认恢复了 Tunnel runtime，且本地插件／stdio 调用正常；尚未通过
新的远端 ChatGPT 调用确认端到端恢复。此次退出原因仍无证据确定。

日期：2026-09-27。Obsidian 1.13.7，Node 24.14.1，插件 0.1.0。
修改测试限定在 `STEM/MCP验收测试`；课程笔记只进行搜索与读取。

## ROG 接受候选滚动修复（2026-10-07）

本轮按用户要求仅在 META-ROGALLY 安装、部署和实测。Obsidian 1.14.4 官方
Windows 安装包签名为 Dynalist Inc，SHA256 与发布清单一致。首次打开 STEM
的仓库信任由用户完成；本机 MCP 连接已建立，没有配置或复用其他主机 Tunnel。

旧版真实“接受”保持同一个 leaf 和文件，却把光标从第 39 行移到开头，
scrollTop 从 882 降到 76，确认是整篇编辑器替换造成的重定位。修复后使用
局部字符变更，未变化的正文保留原位置；一次本地决定期间将滚动快照映射到
后续文档和装饰刷新，直至最后一次刷新完成。

| 验证 | 结果 |
|---|---|
| 三次逐块接受 | 同一 leaf/文件、光标/选区均保持；scrollTop 分别保持 882、2132、3246，正文锚点相对编辑器视口偏移均为 0 |
| 光标在视口之外 | 滚到第二块时光标仍在第 39 行；接受未滚回光标 |
| 最后一块与反向选区 | “保留的阅读位置”反向选区完整保留；审阅结束关闭块和工具栏，未重定位到文首 |
| 全部接受 | 三块全部应用；同一 leaf 与选中文字保留；前方新增一行后选区按原文字移动一行 |
| 全部拒绝 | 旧测试剩余两块拒绝，停留在原正文区域，原行 90/135 未写入候选 |
| 状态与磁盘 | 三份提案均 completed；原版测试只应用第一块，修复测试与全部接受测试应用三块；磁盘正文逐字一致 |
| 自动化 | 49 项测试、TypeScript、插件/MCP 生产构建及打包通过；新增覆盖局部变更、多编辑器、反向多选区、UTF16/CRLF、无变化刷新和写前冲突 |

证据位于忽略的 `.local/qa/scroll-acceptance-20261007.json`、
`legacy-before.json` / `legacy-after.json`、`fixed-before-*` / `fixed-after-*`。
浏览器 CodeMirror 对比记录在 `.local/qa/scroll-browser/report.json`，单列为
布局回归测试，不替代上面的真实 Obsidian 按钮验收。
测试写入只有 `MCP验收测试/ROG滚动-*-20261007.md`。ROG 已部署并加载修复版；
本轮未在 OMEN 或 Mac 独立验证。

## ROG 代码迁移与检查（2026-10-06）

按用户要求将完整 Git 历史从 META-OMEN 复制到 META-ROGALLY，目标为
`C:\Users\Meta\Project\Workspaces\obsidian-context-mcp`。通过 SSH 实机确认
ROG 主机名和目标目录此前不存在；保留 `main` 分支及 GitHub `origin`。
ROG 现有 Node 24.14.1 / npm 11.11.0 完成项目内依赖安装，43 项测试、
TypeScript 检查、插件和 MCP 生产构建均通过，工作树干净。

此次只迁移代码并准备开发环境；未复制 OMEN 的 `.local`、配对、提案、
恢复记录或 Tunnel 凭据，也未部署、重载 ROG 插件。用户报告的接受候选后
当时跳转问题仍待 ROG 真实界面复现；2026-10-07 已完成上述修复。原调查线索见
`docs/ROG-HANDOFF.md`。

## 已验证

| 层级 | 证据与结果 |
|---|---|
| 自动化 | 40 项测试、TypeScript 类型检查、生产插件与 MCP 构建通过；上下文通过公开 API 替身覆盖多选区和无活动笔记 |
| 独立 MCP | 真正的 stdio 客户端发现六个工具；`npm run mcp` 也通过握手与发现 |
| 源码上下文 | 真实中文/emoji 选区返回第 8 行、UTF-16 列 0–20，与界面一致 |
| 审阅上下文 | 打开正文候选后仍返回原笔记与原选区 |
| 浏览器失焦 | 原生窗口切到真实 Chrome 前台，仍返回相同文件、选区及 UTF-16 位置 |
| 主动清空 | 返回 Obsidian 取消选区，工具返回空选区和当前位置 |
| 阅读模式 | 渲染选区文字正确，类型为 `rendered`，没有源码坐标，cursor 为 null |
| 搜索与读取 | “平均相对速率”在真实 STEM 找到 4 个结果；搜索完整，正文可读取；图片只返回元数据 |
| 旧视图移除 | “待审阅修改”视图代码及 Merge 依赖已移除；重载后原标签页自动关闭，没有再次出现 |
| 正文内审阅 | Markdown 原行标红、候选行紧随其下标绿；候选内容不进入文件。真实 UI 中逐块接受 1、2、4，拒绝 3，磁盘正文与状态一致；重新加载后待审阅块恢复 |
| 正文内上下文 | 打开正文候选不覆盖用户笔记快照；真实源码选区和跳转后的上下文保存在 `.local/qa/inline-context.json` |
| 新建正文预览 | 新建候选 `348fce51-9c3c-4502-96f1-138820e6d36a` 在当前笔记顶部显示完整候选和按钮；拒绝后预览消失，状态 `completed` / `rejected`，目标文件不存在 |
| 移动正文预览 | 带入链移动候选 `85fe6ca1-72d1-41e5-8357-053a8713b9b7` 在源笔记顶部显示路径、引用笔记的原文与候选；长预览从顶部定位；拒绝后路径与链接未变 |
| 四块审阅 | 1、2、4 接受，3 拒绝；磁盘正文对应；状态 `completed` / `partially_accepted` |
| 重启 | 第 1、2 块已应用时重新加载；未完成块和部分接受状态正确恢复 |
| 过期候选 | 在 Obsidian 手动追加原文，提案变为冲突，未写入候选 |
| 新建 | 先预览，接受后创建子目录中的新文件 |
| 移动与链接 | 源文件出链、引用笔记的 Wiki / Markdown 入链一起预览、一起接受；手写别名和 `#-` / `#=` 子路径保留；代码中的链接保留 |
| 最终解析器复测 | 更新后的 Markdown 解析器在真实 Obsidian 中生成逆向移动的两组链接 diff；全部拒绝后状态为 `completed` / `rejected`，操作日志没有应用步骤，文件路径与正文保持原样 |
| 附件重命名 | 图片移动后嵌入更新；字节大小与附件 revision 保持 |
| 回收与恢复 | 专用文本进入 `.trash`，原路径消失；本地恢复按钮还原原路径和原内容；重新加载后状态为 `restored`，恢复步骤记录保留 |
| 专用 Tunnel | `obsidian-context-stem-win` 运行状态为 `ready`，Tunnel ID 为 `tunnel_6ab8e356341081918c02253bec374df6` |
| ChatGPT 连接 | Xia 工作区的专用应用已连接；[真实测试聊天](https://chatgpt.com/c/6ab8eac8-5204-83e8-8e90-96ff00709596) 调用上下文与读取工具，返回真实 STEM 文件和测试笔记前几行 |
| ChatGPT 候选与状态 | 同一聊天调用 `obsidian_propose_changes` 和 `obsidian_get_change_status`，得到提案 `6eece0ce-1037-4d2e-bc42-c66623497325`、初始状态 `awaiting_user_review`；本次复查其状态已为 `completed` / `accepted`，目标文件存在 |

详细请求、结果、原文副本和状态记录保存在忽略的 `.local/qa`，避免把仓库正文
或配对信息加入 Git。安装 ZIP 位于 `dist/obsidian-context-mcp-0.1.0.zip`。
最终安装包包含插件的 `manifest.json`、`main.js` 和 `styles.css`；已部署版本与最终构建一致。

## 运行验证发现与修复

- Electron 插件不能通过原样动态 `import("node:fs/promises")` 加载 Node 模块。
  改为构建器处理的静态导入，真实读取恢复正常。
- 冷启动时 Vault 文件索引尚未就绪。提前检查恢复提案会产生虚假缺失冲突。
  验证与本机服务启动改到 `workspace.onLayoutReady`，重启复测通过。
- 每次接受后的重绘曾把滚动位置送回顶部，已保留位置；真实逐块操作复测通过。
- 使用 Markdown 语法树排除引用中的代码块、缩进代码与跨行行内代码，并支持
  Markdown 引用式链接定义，避免移动时误改示例代码。
- 真实 ChatGPT 首次提交新建候选时，持久化已经成功，但旧审阅视图延迟加载导致
  远端收到错误。旧视图现已彻底删除；提案结果与本地界面打开分离，界面故障
  不再改变远端提交结果。同一 `request_id` 重试返回原提案，未重复创建。

首版 Windows STEM 的本地流程与 ChatGPT 端到端验收已完成。专用 Tunnel 是按需
启动的项目 runtime，使用前运行 `npm run tunnel:start`；当前状态已复查为 `ready`。
远端创建的测试提案在本次复查时已由本地审阅接受；新的两项界面测试候选均
被拒绝，没有写入目标文件。

2026-09-28 故障复测：用户在[原聊天](https://chatgpt.com/g/g-p-6a9e26c0ed3c8191ac5bdd6c9f745791-hua-xue-dong-li-xue/c/6ab94861-5834-83e8-a00c-55b237672992)
读取划线内容时收到 `McpServerError: Session terminated`。本机独立 stdio
调用仍返回该笔记的非空选区，而 `tunnel:status` 为 `stopped`。运行
`npm run tunnel:start` 后状态为 `ready`；同一聊天重新调用上下文工具成功，
返回正确笔记路径并确认选区非空。确认的断点是 Windows 专用 Tunnel 已停止；
尚无日志证明它为何退出。

## macOS STEM 适配

日期：2026-09-28。Mac 为 Apple Silicon；项目位于
`/Users/meta/Project/Workspaces/obsidian-context-mcp`，只部署
`/Users/meta/Documents/Obsidian/STEM`。Windows 的 `.local` 未复制到 Mac。

| 层级 | 证据与结果 |
|---|---|
| Mac 构建 | 本机 `npm ci`、43 项测试、类型检查、插件和 MCP 生产构建、三文件 ZIP 打包通过 |
| Mac 部署 | `npm run deploy -- /Users/meta/Documents/Obsidian/STEM` 完成；备份在 Mac 项目 `.local/deployment-backups`，Mac Obsidian 已启动 |
| 本机 MCP | 独立 stdio 客户端发现六个工具；`obsidian_get_context` 返回真实当前笔记 `02笔记/化学/化学动力学/01传递过程和非平衡态热力学.md`，模式 `source`、选区 0；搜索“平均相对速率”返回 3 条有界结果，按行读取该笔记返回 183 总行数和 revision |
| Mac Tunnel | 独立 Tunnel `tunnel_6ab9425b741081919d5a7ba1f10a3641` 关联 Personal / Xia；项目 alias `obsidian-context-stem-mac` 的 `tunnel:status` 为 `ready` |
| ChatGPT 连接 | [Obsidian Context MCP — STEM Mac](https://chatgpt.com/plugins/plugin_asdk_app_6ab943060aa48191960e218b3fc67cd6) 显示“已连接”；[真实调用聊天](https://chatgpt.com/c/6ab943b2-adb0-83e8-8dc3-8ba0baf0a610) 返回同一 Mac 笔记路径、模式及选区数，完成搜索后的读取，并提交一项新建测试候选及查询状态 |
| Mac 候选 | 网页提交的提案 `513470ed-bd0d-4cc4-a7bd-57679de54300`，目标 `MCP验收测试/Mac端内联审阅验收.md`；网页和本机 stdio 状态均为 `awaiting_user_review`。目标目录尚不存在，提交没有写入 Vault |

Mac 界面的候选接受／拒绝、冲突和重启恢复尚未实机验收；不得把本机测试、
Tunnel `ready` 或候选提交等同于这些流程通过。本机只读验收请求与结果保存在
Mac 项目忽略的 `.local/qa` 中；没有修改课程笔记。

## Windows 桌面客户端注册

日期：2026-10-06；主机 META-OMEN。使用既有 Node 和生产 MCP，未改动插件、
配对、Vault 或 ChatGPT Tunnel。服务名为 `obsidian-context-stem-windows`。

| 层级 | 证据与结果 |
|---|---|
| 配置合并 | Antigravity 全局 `mcp_config.json` 保留 `agent-history` / `computer-use`；Claude Store 的实际 Desktop 配置保留 `agent-history`、preferences 和文件目录设置。解析后比对确认只新增目标 MCP 条目 |
| 启动命令 | 分别使用两份配置中的绝对 Node 路径、参数和环境，从非项目工作目录完成 MCP 握手；均发现完整六工具，并成功调用 `obsidian_get_context` 返回 `vault: stem` |
| Antigravity Desktop 2.19.1 | 启动后 `.gemini/antigravity/mcp/obsidian-context-stem-windows/` 生成六份工具定义和服务器 instructions；实际 MCP Node 进程由桌面版 `language_server.exe` 启动 |
| Claude Store Desktop 2.19675.1.0 | 完整重启后 22:55:17 的 `Local/Claude/logs/main.log` 确认协议协商 `2025-11-25`、`Connected to obsidian-context-stem-windows (6 tools)` 及工具发布；既有 `agent-history` 仍连接成功 |

验收限于配置、桌面程序发现工具及只读上下文调用；未发送模型聊天或创建新候选。
笔记写入仍沿用既有的 Obsidian 本地审阅流程。配置前副本和有界验证记录在忽略的
`.local/desktop-client-backups/20261006/` 与 `.local/qa/desktop-clients-20261006.json`。

## Windows Tunnel 重启后恢复与远端验证

日期：2026-10-07，23:44–23:45（UTC+8）；主机 META-OMEN。
用户报告先 404、随后 429；本轮直接复现的是
`McpServerError: MCP SSE probe returned 429 from openai.org`，来源为 OpenAI
内部 MCP Tunnel 网关，尚未进入 Obsidian 工具。

| 层级 | 证据与结果 |
|---|---|
| 本机插件与 stdio | 独立 `node scripts/call.mjs obsidian_get_context` 成功，返回 `vault: stem`、`01项目/传递过程与非平衡态热力学.md`、`source` 模式；当前选区为空 |
| 故障时 Tunnel | `stopped`；记录中的 PID 17692 不存在，原健康端口 53437 拒绝连接 |
| 生命周期 | 旧 runtime 启动时间为 00:15:19；系统当前启动时间为 15:52:38。旧日志最后一条为 01:01:41 的轮询 EOF，之前同类错误曾自动恢复；没有明确退出记录，不能据此认定 EOF 是退出原因 |
| 恢复 | `npm run tunnel:start` 返回 process mode 连接成功，`npm run tunnel:status` 返回 `ready`，沿用原 Tunnel ID |
| 真实远端调用 | 同一个 STEM Windows `obsidian_get_context` 连接工具在恢复后成功，返回相同笔记路径、`source` 模式、选区数 0，以及 context ID `e559f7fd-cd72-4171-adb0-9132e26b619f` |

确认的当前缺口是系统重启后没有自动恢复这个按需启动的 runtime；最初退出的
具体时间与触发原因仍未知。429 在这次事件中是连接探测的错误，不能用作模型
额度耗尽的证据。没有重载插件、改变客户端配置、提交候选或写入笔记。

## Windows Tunnel 429 再次复现与恢复

日期：2026-10-11（UTC+8）；主机 META-OMEN。

| 层级 | 证据与结果 |
|---|---|
| 原始远端错误 | 真实 Windows `obsidian_get_context` 返回 `McpServerError: MCP SSE probe returned 429 from openai.org`，错误类型 `invalid_mcp_response`，来自内部 MCP Tunnel 网关 |
| 本机插件与 stdio | `node scripts/call.mjs obsidian_get_context` 成功，返回 STEM 当前笔记 `01项目/传递过程与非平衡态热力学重写/传递过程与非平衡态热力学.md`，`source` 模式 |
| 故障时 Tunnel | `stopped`；记录中的 PID 9228 不存在，健康和就绪端口 58712 拒绝连接 |
| 生命周期 | runtime 记录仍为 2026-10-07 23:44:47；最后日志为 2026-10-08 17:35:10 的 `poller recovered; polling operational`。系统此后有多次启动记录，当前启动时间为 2026-10-11 00:11:11。没有日志证明旧进程最初的退出触发原因 |
| 恢复缺口 | 项目启动脚本只调用 `runtimes connect`；未发现此专用 Tunnel 的自动启动任务。另一个 `codex-chat-local-tools-win` Tunnel 正在运行，不能代表 Obsidian 专用 Tunnel 正常 |
| 恢复及真实远端验证 | `npm run tunnel:start` 成功，随后状态 `ready`；刚才失败的同一个 Windows MCP 上下文工具成功返回上述笔记及 1512 字符的附近正文，context ID 为 `b4c9d994-f420-4a22-9d54-faf465071902` |

这次再次确认停止的专用 Tunnel 与远端 429 的关联：恢复本机 Tunnel 后，原始
远端调用随之恢复。反复不可用的已知缺口是缺少登录自动启动和进程退出后的
恢复机制；本次仅恢复现有 runtime，未配置持久自动启动。旧日志中的轮询 EOF
多次自行恢复，最后记录也为恢复成功，不能认定 EOF 直接导致进程退出。
没有重载 Obsidian、修改插件设置、提交候选或写入笔记。

## Windows Tunnel 自动启动与恢复验收

日期：2026-10-11，16:56–16:59（UTC+8）；主机 META-OMEN。
用户在确认反复不可用原因后要求补上登录自启和进程退出恢复。

| 检查 | 证据与结果 |
|---|---|
| 安装及身份 | 当前用户任务 `Obsidian Context MCP Tunnel`，InteractiveToken、默认 Limited 权限，动作是本机绝对 PowerShell / Node / 项目路径，沿用原 alias 和 Tunnel ID；未改变 Mac 或其他 Tunnel |
| 实际触发器 | 导出的任务 XML 包含本用户 LogonTrigger 和 TimeTrigger；重复间隔 `PT1M`，没有 Duration / EndBoundary；允许电池供电、错过后补跑、IgnoreNew，执行时限两分钟 |
| 正常连接 | 安装后真实任务返回 0，健康运行的 PID 37392 保持，未为正常检查重启 Tunnel |
| 受控退出 | 核对 PID 37392 的程序名和 `--profile obsidian-context-stem-win` 后于 16:57:47 仅结束该进程；没有手动启动或主动触发恢复任务 |
| 周期恢复 | 定时任务于 16:58:40 自行执行，16:58:48 观察到新 PID 44264 ready，约 61 秒恢复；任务随后 Ready、LastTaskResult 0，另一个 local-tools Tunnel 原 PID 保持 |
| 手动维护 | stop 写入暂停标记；直接检查和真实任务均保持 stopped。start 清除暂停标记后恢复 ready |
| 最终远端 | 恢复后真实 Windows `obsidian_get_context` 成功，返回当前 STEM 笔记 `01项目/传递过程与非平衡态热力学重写/传递过程与非平衡态热力学.md` 及 1512 字符附近正文 |
| 静态检查 | Node 脚本语法、Windows PowerShell 语法、package.json 解析和 Git whitespace 检查通过；未修改插件/MCP 协议源码 |

证据保存在忽略的 `.local/qa/windows-tunnel-autostart-20261011.json` 和项目本地
supervisor 日志。实际注销／登录和整机重启没有执行；已核对登录触发器配置，
但不能用本轮周期恢复替代真实重启验收。没有改动 Obsidian 笔记、插件设置或
提案。自动恢复减少本机进程停止造成的不可用，不保证外部网关永不返回 429。

## Windows 改为仅登录自启和桌面手动启动

日期：2026-10-11，18:13（UTC+8）；主机 META-OMEN。
用户明确要求取消每分钟检查，只保留开机登录自启，并把手动启动快捷方式
发送到桌面。本节取代上一节的周期恢复方案；历史验收记录保留。

- 原任务先禁用，再更新为单个本用户 LogonTrigger；导出实际 XML 确认没有
  TimeTrigger 或 Repetition，状态查询显示 TriggerCount 1、PeriodicChecks false。
- 登录动作改为原 `tunnel.mjs start`；移除 ensure、暂停标记控制和 supervisor
  代码。计划任务启动动作返回 0，NextRunTime 为 null，原 Tunnel 身份与凭据保留。
- 桌面实际创建 `C:/Users/Meta/Desktop/Obsidian MCP.lnk`，目标为 Windows
  PowerShell，参数指向项目启动脚本和既有绝对 Node 路径，隐藏运行；图标来自
  `C:/Program Files/Obsidian/Obsidian.exe`。
- 手动停止 PID 46544 对应 runtime 后，通过实际 `.lnk` 启动，观察到 PID 39104
  ready；随后真实 Windows `obsidian_get_context` 成功读取当前 STEM 上下文。
- Node / PowerShell 语法和实际任务、快捷方式配置均已验证。本轮没有注销或
  重启电脑；没有修改笔记、插件设置、提案或其他 Tunnel。

当前证据在忽略的 `.local/qa/windows-tunnel-login-only-20261011.json`。

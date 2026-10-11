# Windows 专用 Tunnel 登录自启与手动启动

## 范围与身份

只管理本机 `.local/tunnel.json` 指定的 Obsidian 专用 Tunnel。沿用既有 alias、
Tunnel ID、配置目录和凭据源，不创建另一条连接，不影响 local-tools 或 Mac。
凭据只传给 tunnel-client；`start-mcp.mjs` 继续在启动 MCP 子进程前清除凭据
和代理环境变量。

## 生命周期

用户于 2026-10-11 明确选择仅保留开机登录自启；发现进程退出时自行启动。
因此当前用户计划任务 `Obsidian Context MCP Tunnel` 只有一个 LogonTrigger，
没有定时触发器、重复间隔或失败后自动重新运行。任务使用 Interactive / Limited，
不保存用户密码、不提权；隐藏运行，允许电池供电，重叠触发采用 IgnoreNew。

登录动作调用 `tunnel.mjs start`。桌面 `Obsidian MCP.lnk` 调用相同的隐藏启动
脚本和绝对 Node 路径，供用户双击恢复。快捷方式使用本机 Obsidian 图标；
安装脚本的 Shortcut 模式可重新创建它，遇到同名无关快捷方式会拒绝覆盖。

`tunnel:stop` 停止当前 runtime，`tunnel:start` 手动启动；下一次登录仍会启动。
先前的 ensure 检查、暂停标记及定时 supervisor 逻辑已移除；原验收日志保留
为历史证据。Tunnel 运行期间自身的网络重连仍由 tunnel-client 管理。

## 验证与边界

读取实际任务 XML，确认只有本用户登录触发器，没有 Repetition。确认启动动作
返回成功，读取桌面快捷方式的实际目标、参数和图标。手动停止 runtime 后，
通过真实 `.lnk` 启动恢复 ready，再确认真实远端 MCP 调用成功。

这些验证不等于真实注销／登录或整机重启验收。未经用户要求不重启机器。
使用时网络、凭据和 Obsidian 本机插件仍须可用。

## 移除与维护

`tunnel:autostart:uninstall` 只移除这个项目拥有的任务，保留 runtime、凭据、
配对和桌面快捷方式。同名任务若不属于本项目，安装或移除会拒绝覆盖。
改变项目或 Node 路径后重新安装任务并运行 `tunnel:shortcut`，更新绝对路径；
不通过环境变量或 PATH 修改解决路径变化。

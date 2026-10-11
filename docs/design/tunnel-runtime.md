# Windows 专用 Tunnel 自动恢复

## 范围与身份

只管理本机 `.local/tunnel.json` 指定的 Obsidian 专用 Tunnel。沿用既有 alias、
Tunnel ID、配置目录和凭据源，不创建另一条连接，不影响 local-tools 或 Mac。
凭据只传给 tunnel-client；`start-mcp.mjs` 继续在启动 MCP 子进程前清除凭据
和代理环境变量。

## 生命周期

Windows 当前用户计划任务 `Obsidian Context MCP Tunnel` 在登录时运行，另有
无结束时间的每分钟重复触发器。任务使用 Interactive / Limited，不保存用户
密码、不提权；隐藏运行，允许电池供电，错过执行后补跑，重叠触发采用 IgnoreNew。
短检查最长两分钟；下一次周期可恢复失败或被结束的检查任务。

每次运行 `tunnel.mjs ensure`：

1. 若存在项目本地 `tunnel-auto-paused`，退出，不启动 Tunnel。
2. 获取原 alias 的结构化运行状态；无效状态或查询失败只记录失败并等待下次。
3. 如果进程仍在运行，不重启。网络 EOF、短暂未就绪由原 poller 自行重连。
4. 只有 `process_running === false` 时才调用原连接命令；启动前再次检查暂停标记。

停止命令先写暂停标记再断开，防止下一次检查把用户手动停止当作故障。
启动命令先清除暂停标记，恢复连接及自动恢复。暂停状态跨重启保留。
`tunnel:status` 保留原语义；自动启动安装与任务状态由独立命令管理。

自动检查日志只记录恢复和失败事件，不写每次正常检查，也不保存 CLI 原始
输出或凭据。日志在 `.local/tunnel-supervisor.log`，超过 512 KiB 保留一份轮转。
既有 Tunnel 详细日志由 tunnel-client 继续管理。

## 验证与边界

读取注册后的实际任务 XML，确认用户、两种触发器、无限重复、电池设置和动作
绝对路径。让真实计划任务执行成功；结束且仅结束该 alias 的已核实进程，
等待周期触发将它恢复，然后确认真实远端 MCP 调用成功。再验证手动停止
期间自动检查不会启动它，恢复启动后回到 ready。

这些验证不等于真实注销／登录或整机重启验收。未经用户要求不重启机器。
恢复时网络、凭据和 Obsidian 本机插件仍须可用；本机制不保证外部网关永不 429。

## 移除与维护

`tunnel:autostart:uninstall` 只移除这个项目拥有的任务，保留 runtime、凭据和
配对。同名任务若不属于本项目，安装或移除会拒绝覆盖。改变项目或 Node 路径
后重新安装任务，更新绝对路径；不通过环境变量或 PATH 修改解决路径变化。

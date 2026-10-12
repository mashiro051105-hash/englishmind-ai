# v0.4 部署与维护（未实际发布）

推荐先部署**公开Mock课程演示**。真实AI仅在本地授权验收通过后，另行考虑受控私有演示。本项目没有创建云服务、没有发布URL，也没有执行收费测试。

## 推荐：Render Free单实例Node Web Service

资料核验日期2026-10-12。[官方Free说明](https://render.com/docs/free)列出每月750实例小时、空闲15分钟休眠、唤醒可能约1分钟、临时文件系统、免费实例不能附持久磁盘。流量／构建超出额度可能额外收费；未绑定付款方式时对应服务或构建会停用。创建前自行核对账户页面和当前条款。

选择它是因为免费Web Service仅一个实例，能与现有内存会话兼容。**重启、部署、休眠后未完成会话丢失**，浏览器会提示重新开始，本地档案保留。不使用serverless、多副本或无粘性轮询；APP_INSTANCES=1，生产配置检查拒绝明确配置成多实例。不承诺长期连续在线或持久服务端学习记录。

步骤：

1. 在本地运行 `npm ci --include=dev`、`npm test`、`npm run build`、`npm run security:check`。
2. 仅在你决定发布后，将Git仓库推送到自己的代码托管；确认.env、密钥、.artifacts和日志没有提交。不要上传整个workspace。
3. 在Render选择Node Web Service及Free计划，连接仓库。也可审阅render.yaml后使用Blueprint；本文件只准备配置，不会自动创建服务。
4. Build：`npm ci --include=dev && npm run build`；Start：`npm start`；健康检查：`/api/ready`。保留构建依赖，因为当前运行入口使用tsx，不执行npm prune --omit=dev。
5. 设置NODE_ENV=production、NODE_VERSION=24.19.0、AI_PROVIDER=mock、ENABLE_PAID_AI=0、APP_INSTANCES=1。SESSION_COOKIE_SECRET使用至少32字符随机值（Blueprint可生成），不要使用测试夹具中的固定字符串。
6. TRUST_PROXY_HOPS=1仅适用于Render的单层可信代理。自行服务器默认0；只通过可信反向代理开放访问，不盲目信任客户端X-Forwarded-For。
7. PUBLIC_ORIGIN设为实际HTTPS地址。Render也可使用其自动提供的[RENDER_EXTERNAL_URL](https://render.com/docs/environment-variables)，二者选择一个；不要保留.example占位符。PORT由平台注入，应用绑定0.0.0.0。
8. **不配置OPENAI_API_KEY**，不设置ENABLE_PAID_AI=1。此公开版本不会调用收费Provider。
9. 实际发布完成后，登记平台返回的真实URL，验证/api/health和/api/ready，再测试桌面／手机、刷新、同源API、本地记录、Cookie及清空。不要提前编造地址。
10. 设置平台费用／构建支出限制，查看流量与运行额度；暂停不需要的服务。不通过定时请求人为绕过免费休眠政策。

## 单机常驻演示备选

已有学校服务器或自己的单机可运行上述安装／构建命令，使用现有进程管理器启动npm start，并以HTTPS反向代理同源页面和/api。确保只启动一个Node进程，非cluster、非多副本。此方案是否免费取决于现有资源，不新购云主机。重启仍失去未完成会话。

不添加大型数据库。若未来必须跨重启保留服务端会话，再评估小型外部存储并完善状态事务；当前没有声称已持久化。

## 真实AI受控入口（需要另行明确授权）

配置凭证本身不会启用收费网页。另需AI_PROVIDER=openai、ENABLE_PAID_AI=1、至少16字符AI_ACCESS_CODE及生产Cookie密钥、正确HTTPS源。用户需在页面输入演示访问码；码不在URL、localStorage或前端构建产物里。签名HttpOnly Cookie绑定浏览器，知道会话ID仍不能读取另一浏览器的数据。

缺访问码／启用开关的请求在模型调用前拒绝。全局默认12次模型请求、每轮30次、每分钟默认20次；建议受控演示另设AI_MAX_CALLS_PER_MINUTE=6。失败调用也计入次数。重启会重置单进程预算，**不能视为货币级账户预算**；必须同时设置服务商账户预算。不要在免费公开Mock服务上直接填密钥或开启收费入口。

## 健康、日志、回滚

/api/health是存活检查，包含配置ready，但不访问模型；/api/ready对部署配置缺失返回503。在线模型权限／质量需要独立授权工具验证。

服务器不打印输入、访问码、Cookie或API Key；SDK日志关闭。在线评价遥测只有模型／操作／延迟／结果／usage／估价，异常usage用null，真实账单待账户确认。

v0.3.0本地检查点为dd3aa36。需要回看时使用 `git show v0.3.0:server/teaching.ts`，需要运行旧版时新建独立worktree，不直接重置当前修改：`git worktree add ../englishmind-v0.3 v0.3.0`。回滚生产版本会丢失临时会话；浏览器档案不因服务部署被删除。

部署前与维护时重复必要测试，核查依赖公告与价格。更换Cookie密钥使已有浏览器身份失效，提醒用户重新开始；访问码轮换建议重启使已签发的paid Cookie失效。不同浏览器或清除Cookie后不会共享训练会话。

## v0.5本地模型边界

OllamaProvider仅支持开发环境本机回环地址，生产配置拒绝启用。Render Free没有本方案需要的笔记本GPU，也不能通过localhost访问作者电脑。公开演示继续Mock；Windows本地AI按[本地指南](ollama-windows.md)执行，不需要OpenAI余额。

## 实际部署验收（2026-10-12）

作者提供的公开演示为 https://englishmind-ai-mock.onrender.com 。health/ready和真实Chromium桌面/移动三组教学闭环已通过，Mock模式且paidEnabled=false；Cookie、安全响应头及档案清空刷新正常。控制台计划/账单无法从公共HTTP确认，请作者保持Free单实例；平台休眠唤醒与重启尚未实测。

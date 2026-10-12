# EnglishMind AI v0.3.0

面向中国大学英语学习者的自然表达训练应用。保留 v0.2 的 React / TypeScript / Vite / Express / Zod 教学架构，增加**独立 OpenAI Provider**（官方 Node SDK + Responses API），同时保留无需凭证的 Mock。

**没有真实 API 凭证时默认 Mock，不伪装 AI。当前交付未进行在线模型验证。Coze 智能体由用户独立制作，作为课程验收及对照测试对象；本项目不实现 CozeProvider，也没有虚构公开链接。**

## 本地启动

Node.js 22.19+（验证环境24.19.0）。

```bash
cd /workspace/englishmind-ai
npm ci
# 若尚无 .env，可从 .env.example 复制；保留已有配置，不提交密钥。
npm run dev
```

运行机器访问 `http://localhost:5173`，Vite 代理 `/api` 到3001。远程环境需已有端口转发，localhost不是公开发布链接。

```bash
npm test
npm run typecheck
npm run build
npm start
```

生产访问运行机器 `http://localhost:3001`，Express 同时提供页面与API。不能只上传dist到静态托管。正式部署使用单Node进程、同源HTTPS反向代理和环境变量；本版没有多副本会话存储或用户鉴权，公开部署还需补齐这些能力。

## 切换模式和API配置

`.env.example` 为无密钥模板。

```dotenv
AI_PROVIDER=mock
PORT=3001
```

真实模式修改服务端 `.env` 或部署环境：

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=你的服务端凭证
OPENAI_MODEL=你账户可用且支持Responses结构化输出的模型ID
AI_TIMEOUT_MS=20000
AI_MAX_OUTPUT_TOKENS=1800
AI_MAX_CALLS_PER_MINUTE=20
AI_MAX_TOTAL_CALLS=200
```

切换后重启服务。模型没有代码默认值，必须显式配置。**不要将密钥放前端、VITE_变量、截图、日志或提交文件。** `.env` 已忽略；应用不会输出密钥或上游原始报错详情。SDK通过undici代理客户端保留继承的HTTP_PROXY/HTTPS_PROXY和CA信任；普通无代理部署也可用。

`GET /api/health` 返回 provider、ready、stage=3和notice。ready只表示配置可构造Provider，**不证明模型权限或在线连通性**。真实模式缺配置返回ready=false，练习API返回503；不会回退Mock。未知Provider及coze同样明确不可用。

选定模型必须支持 [官方结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs) 和 [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)。SDK发送严格JSON Schema、store=false和输出token上限，再用Zod及证据一致性规则校验。模型兼容性、权限、质量和延迟需要真实账号验证。

## 教学闭环

表达诊断 → 提交后的结构化反馈 → 针对性独立训练 → 反馈 → 新情境迁移 → 结束或增加情境变化。也可直接选择中文主题开启情境训练。

- 五类诊断：grammar、collocation、contextual_mismatch、acceptable_but_improvable、no_issue，最多三个高价值问题；正确表达不制造训练目标。
- 诊断可填写原意及关系背景，真实AI据此理解语境；证据不足使用unassessed。只处理本轮最高优先级目标，真实目标可为任意词块／lexical frame，不限Mock的四种目标。
- 真实AI生成大学生难度的任务；公开题目只用中文描述情境与交际意义。参考表达、目标及支架保留在服务器，学生主动请求提示后才展示支架。
- 生成结果拒绝英语／明显答案提示、重复和高度近似题目、重复迁移情境标识及原句参考。传递原始表达和旧情境约束，要求明显改变人物、地点、话题或交际对象。过滤仍是保守文本检查，无法证明所有中文暗示或语义重复都被发现。
- 真实评价根据意义、自然度／语境及目标或合理等效表达三项证据，不要求等于参考句。AI不能改变练习历史或状态。服务器计算首次独立／提示后／重试后成功，重复已见作答或参考标为copied_answer。
- 成功建议迁移或结束，可增加变化；部分成功建议提示（连续三次仍部分成功建议结束）；失败建议降低要求或重试，两次失败建议结束。降难度保留核心目标，要求简短表达，不额外收费生成。
- 所有成功仅表示本题表现，不证明长期掌握。不以单次错误认定母语迁移。

自然对话也通过真实Provider单轮回复；Mock仍是固定脚本。对话暂不维护多轮历史、不进入迁移计分。

## 异步一致性、错误和费用边界

沿用awaiting / feedback / completed状态与revision、requestId。每轮一个异步操作；相同键与相同参数共享处理中Promise，已成功请求返回最新状态，不再次调用模型或记账。冲突动作、旧revision、非法转换返回409。失败请求键不能改参数；可同键重试。调用在克隆状态上完成，校验后原子提交；超时取消，迟到响应不提交。GET始终读取已提交快照。

默认模型调用20秒超时，整次教学操作35秒硬超时，浏览器45秒；SDK自动重试关闭。每轮30次真实调用、每分钟20次、每进程总200次，失败调用也计入本地调用预算；可结束／重置已到上限的本轮。输入最多2000字符、原意500字符、模型输出1800token（可配置300–4000）、返回文本最多16000字符。没有自动收费重试，任务被拒绝时需要用户手动重试。

400参数／JSON错误；404会话失效；409冲突；413大请求；429本地调用上限或上游限流／额度不足；502异常JSON、Schema、矛盾证据、泄露／重复任务或上游故障；503配置／认证／权限／容量问题；504超时。错误不写作答或成功，但已经发生的模型请求可能计费。

**费用**：Mock及默认自动测试不调用收费模型。真实闭环通常5次模型请求（诊断、生成初练、评价、生成迁移、评价），每次重试／新增情境会增加调用；价格按模型输入／输出token和服务商计费规则变化，查看 [官方价格](https://openai.com/api/pricing/)。本地次数上限不是货币额度，也不能跨进程限制总账单；重启会重置计数。建议同时设置服务商账户预算。已配置真实模式后，点击训练和发送对话会调用真实API。

## 刷新、本地档案与隐私

服务器临时内存会话：单进程、闲置24小时失效，重启即丢失。会话ID存在当前设备，刷新GET恢复已提交状态；未提交草稿不保存。临时网络故障保留ID供恢复，确认404才清除。重启后显示会话失效并允许重新开始，已保存本地档案保留。请求未返回前刷新可能丢失该页面的待重试键，建议等待／同步，尤其真实生成任务开始时。

本地档案最近100轮，按ID更新，记录日期、目标、诊断、结束／停止状态、每次作答、迁移结果、提示／重试次数及provider。旧v2记录缺provider按Mock解码；v1保留为legacy历史，不计成功。存储损坏不覆盖，禁用／满额提示本页内存回退。清空记录不会删除服务器仍进行的会话，下一次反馈可再建立本轮记录。

**档案只保存在当前设备浏览器，但练习文本会发送到本项目服务器；真实模式还会传给OpenAI。** store=false关闭Responses应用层保存请求，不等于服务商零留存；其数据处理以账户及服务商政策为准。不要把浏览器档案当作不可篡改的考试证据。会话ID为随机访问标识，请勿分享。

## 主要文件与复用

| 文件 | 职责 |
| --- | --- |
| server/provider.ts | 同步Mock／异步AI接口、动态目标与调用上下文、输出校验 |
| server/openai-provider.ts | 官方SDK、动态诊断／任务／语义评价／对话、错误和调用预算 |
| server/ai-schemas.ts / task-safety.ts | 严格模型输出及答案／重复情境防护 |
| server/teaching.ts | 原教学状态机的异步提交锁、幂等、硬超时、服务器决策和历史 |
| server/config.ts / app.ts | 环境配置选择与HTTP边界，无凭证禁止真实模式 |
| shared/contracts.ts | provider联合类型、诊断与会话契约、旧档案兼容 |
| src/useTeaching.ts / api.ts | 恢复、同键重试和友好错误，不包含模型密钥 |
| src/TrainingPanel.tsx / FeedbackView.tsx / App.tsx | 原意输入、模式区分、独立作答、反馈和本地记录 |

未来CozeProvider可实现同一接口，仍由服务端控制状态、计数、历史和答案隔离；本阶段没有实现它。课程要求仍需单独Coze真实发布证据。

## 测试与演示

```bash
npm test                # 默认全部Mock或SDK模拟HTTP，零模型调用
npm run test:browser    # 先启动npm run dev；需要本机Chromium
npm run test:restart    # 先构建；自启动3015并实际重启，零模型调用
npm run test:live       # 默认跳过，不自动收费
```

浏览器脚本使用playwright-core及已安装Chromium，可用CHROMIUM_PATH指定浏览器，BROWSER_BASE_URL指定检查地址；不自动下载浏览器。显式在线冒烟：配置服务端凭证后使用 `RUN_LIVE_AI=1 npm run test:live`，最多两次调用，检查诊断及可选任务，不替代完整真实语义质量验收。默认npm test绝不执行此脚本。

见 [至少三个端到端案例](docs/demo-cases.md)、[检查报告](docs/verification.md)、[架构](docs/architecture.md)、[课程对照清单](docs/course-submission.md)。

# v0.4.0 实际验收报告

日期：2026-10-12（Asia/Shanghai）。环境Node24.19.0、npm11.9.0、Chromium154。没有真实API凭证，没有用户收费测试授权；在线评价待执行，真实模型调用0次。未创建云服务或公开链接。

## 检查点与保留成果

实际工程存在，但原先没有Git仓库。已建立本地v0.3.0标签和dd3aa36检查点，原41项测试实际通过；没有删除旧测试、没有重新初始化应用或大规模改写状态机。测试因Cookie隔离及新增模型维度作兼容调整，保留原覆盖。

## 本次实际执行

| 项目 | 结果 |
|---|---|
| npm test | 56项全部通过，0失败 |
| npm run typecheck | 通过，含quality与脚本 |
| npm run build | 生产构建通过 |
| npm run test:browser | Chromium1440px/390px，各三组教学闭环、真实计数、刷新、本地档案与无横向溢出通过；正常流程控制台无错误 |
| npm run test:restart | 实际进程重启后会话失效，档案保留；损坏localStorage不覆盖；缺凭证模式不回退Mock |
| npm run test:production | 临时本地HTTPS实际运行构建产物及API，Secure/HttpOnly/SameSite Cookie、CSP、正确表达保护、刷新和档案通过；非公开部署 |
| npm run security:check | 当前源代码及新增文件的密钥特征、空白密钥模板、敏感/runtime忽略路径检查通过 |
| npm audit --omit=dev | 此次运行依赖审计0已报告漏洞；不等于全面安全保证 |
| /api/health、/api/ready | stage=4，Mock且paidEnabled=false，readiness200；生产配置缺失测试503 |
| npm run quality:plan | 正确输出A–H待执行，onlineCalls=0；未跑收费模型 |
| Git diff检查 | 无空白错误；未推送远程 |

新增测试覆盖：语言／自然度／信息／目标分开；自然visit不制造grammar错误；正确搭配但错误情境不冒充完成；引用证据和诊断冲突拒绝；总结数据与实际事件一致；提示初练不冒充迁移；在线门槛、硬预算及取消在SDK发请求前阻断；遥测usage估价与隐私；签名Cookie隔离、错码、伪造Cookie、跨会话读写/取消、开始键命名空间；同源、内容类型、限速/Retry-After、伪造XFF、防源码/env泄露；明确取消与迟到结果不提交；用户文本/伪造字段不能改历史。

A–H完整方案以模拟Provider验证工具流程，结果保持needs_review，不将模拟输出或Schema通过声称为真实教学质量通过。SDK模拟测试也没有实际OpenAI请求。

修复的验收问题：Vite字符串代理改写Host导致新增Origin校验阻止开发请求，已改显式changeOrigin=false并通过浏览器复验；Node测试Cookie jar最初误选第一次登录的旧Set-Cookie，改为读取最后签发Cookie；模板扫描误跨换行匹配空白配置，改为同一行匹配，最终通过。都已实际修复。

## 未验证及限制

尚未执行真实A–H、账户模型权限查询、真实token/费用或公开托管访问。官方资料确认候选模型支持结构化输出，但不证明账户权限或本项目在线质量。未测试真实手机硬件、Safari和屏幕阅读器。

仍采用单实例内存会话；休眠、重启、部署后未完成过程丢失，已有浏览器档案保留。限速与次数预算是进程级，不能替代账户预算；文本防泄露及prompt注入防护不是完整语义保证。需要授权后的少量在线评价及人工复核，公开Mock部署后再核验真实访问。

构建有第三方Zod优化注释提示，不影响成功。验收服务器交付前停止，按README重新运行。

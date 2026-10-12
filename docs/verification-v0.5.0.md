# v0.5.0 实际验收

2026-10-12。Node24.19.0 / Chromium。保留v0.3、v0.4提交及标签，没有重新初始化项目。

| 实际执行 | 结果 |
|---|---|
| npm test | 63项通过、0失败；原56项保留，新增在线停止/模型权限分类及5项Ollama协议/教学测试 |
| npm run typecheck | 通过，包括Provider、本地/在线质量工具、所有测试 |
| npm run build | 通过；第三方Zod优化注释提示不影响产物 |
| npm run test:browser | 真Chromium1440/390px各三组教学闭环、刷新、计数、档案清空后刷新为空、操作说明、无横向溢出及控制台无错误 |
| npm run test:restart | 实际重启会话失效/档案保留，损坏存储保护，OpenAI缺凭证不回退Mock |
| npm run test:production | 本地HTTPS实际运行生产前端/API；Secure、HttpOnly、SameSite Cookie、CSP、刷新档案通过；非Render部署 |
| npm run security:check | 当前源码/模板/忽略规则通过；Git历史密钥/私钥特征扫描0匹配，不等于完整安全审计 |
| quality:plan / quality:local | 均默认待执行、真实推理0次；没有连接Ollama或OpenAI |
| HTTP health/ready | stage5、provider=mock、paidEnabled=false、就绪成功；只验配置不验模型 |
| git diff --check | 通过 |

Ollama新增测试用模拟fetch及真实本机HTTP模拟端点，不依赖安装/权重。验证JSON Schema请求、正确句认可、visit自然表达分项评价、非法JSON/Schema/未完成/404/500、超时取消、连接失败、远程/cloud模型拒绝、生产入口拒绝；诊断→生成任务→独立训练→迁移→结束，答案泄露拒绝且状态不变；Express实际HTTP本地Provider标记及无收费门槛。

修复：在线工具请求异常后停止后续案例；预检脱敏保留错误类型/状态；清空已结束档案移除恢复标识，刷新不重写；首页增加简短指南。版本健康检查期望与v0.5同步，本地测试等待回调类型修正后全量重跑通过。

官方Ollama文档和模型库已读取，确认本机Schema格式、Windows/GPU要求及Qwen3 4B/8B与Qwen2.5 7B量化大小；这是可行性调研，不是性能/教学质量结果。

## 真实推理与费用

没有OpenAI余额/收费授权，未调用模型或账户模型权限API。当前环境没有Ollama和NVIDIA工具，没有下载权重，也没有真实本地推理。实际收费调用0次；没有真实token或账单数据，不能提供实际模型质量成绩。窗口/接口模拟不算在线验收。

## 发布状态

GitHub账号经真实CLI验证；最初创建仓库被集成权限拒绝。作者自行创建并授权后，实际API确认公开空仓库 `https://github.com/mashiro051105-hash/englishmind-ai` 可访问，push权限有效。后续推送与Draft Release以实际GitHub检查结果补充，不把计划当成完成。

Render没有已配置API权限/账号连接，本阶段未创建服务，无公开网站URL。render.yaml保持Free、单实例、Mock、收费入口关闭，前后端同源通信在本地生产HTTPS实测通过，不代表Render已成功上线。

截图位于docs/screenshots，取自上述Mock Chromium反馈界面。ZIP从本地干净提交导出，SHA-256和清单随附；不含Git历史，另存Git bundle保留历史。归档最终生成和完整性检查见交付结果。

## 尚待验收

作者Windows实机Ollama安装、4B模型下载、预热与A–H人工复核；Render账号连接/免费发布后真实HTTPS及休眠重启验收。正式v1.0目前只准备Draft材料，不声称正式发布或真实AI合格。单实例内存会话重启丢失，浏览器档案保留；文本安全检查不提供完整语义或长期教学效果保证。

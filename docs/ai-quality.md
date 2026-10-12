# 真实AI教学质量评价（待在线执行）

本方案独立于普通功能测试，覆盖A–H。没有凭证及明确授权时只运行quality:plan，不能将Mock／SDK模拟测试称为真实模型质量验证。当前在线调用0次，无实际usage或账单。

## 模型、官方资料与价格核验

2026-10-12官方页面确认候选[gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna)和[gpt-6.1-sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)支持Responses及结构化输出。Standard每百万token参考价格：Luna输入0.10美元、缓存输入0.01美元、输出0.50美元；Sol输入2.00美元、缓存输入0.10美元、输出10.00美元。价格、区域附加费和服务等级可能变化，以运行当日官方页面及账户账单为准。Provider显式使用default服务等级，不开启工具或Ultrafast。

先选Luna做小样例，另一次明确授权后才用Sol作少量对照；工具不会自动切换模型或一次跑两个模型。账户实际权限当前未知；启用后只查指定模型的metadata，不批量列模型。

## 入口与安全顺序

1. `npm run quality:plan`：离线显示A–H及准则，无网络模型请求。
2. 复制.env.quality.example到**被忽略**的.env.quality文件，单独填写服务端凭证和OPENAI_MODEL，不放进.env.production公开Mock配置。
3. 在实际运行前再次核对官方模型、当前价格和结构化输出；填写QUALITY_PRICE_VERIFIED_DATE（Asia/Shanghai当日）及三个价格字段。缺字段无法启用。
4. **获得用户明确的收费测试授权后**，才在该文件设置RUN_LIVE_AI=1、PAID_TEST_AUTHORIZED=yes、QUALITY_PREFLIGHT_CONFIRMED=yes。这些开关不是授权请求的替代品，代理不能自行填写来绕过用户确认。
5. 运行 `DOTENV_CONFIG_PATH=.env.quality npm run quality:online`。默认请求预算10，最大12，权限预检也计入；通常1次metadata权限预检加8次模型调用。F复用本次A诊断和固定私有任务夹具，不重复生成收费任务。
6. 不加自动重试；若权限失败立即停止，达到预算后不再调用。Ctrl+C或SIGTERM取消本次运行，终止在途SDK请求，保留.partial结果于.artifacts/quality-*.json。取消不能保证服务商不计费。
7. 审核JSON报告，再结合模型回答逐项人工判断。全部自动检查满足时也只是needs_review，不是教学通过。新测试或对照需要新的授权，不自行反复执行。

## A–H准则

| 案例 | 输入／动作 | 必须核对的教学内容 |
|---|---|---|
| A | I went a trip to Hangzhou last year. | go on a trip，指出介词on，不只给答案 |
| B | I want to learn more knowledge. | 推荐自然搭配，不能绝对禁止learn与knowledge |
| C | I really enjoyed my trip to Hangzhou last year. | no_issue，无强制目标 |
| D | I'm planning to visit Xi'an this summer. | 语言自然、信息完成；visit不自动代表go on a trip词块检索 |
| E | 未作答时生成新迁移情境 | 学生可见题目无目标英语／示范句；核对中文是否隐含明显答案 |
| F | 先请求提示，再用旅行词块 | 服务端hint事件真实存在，成功必须hinted_success，不能first_independent |
| G | I'm going on a trip to Hangzhou next winter. | 搭配／语法可正确，但地点和时间错误，任务不完整 |
| H | 根据本次F实际事件总结 | 初练与迁移分别计数，无未发生成功、无长期掌握结论 |

四个独立维度：languageAccuracy、naturalness、taskCompletion、targetRetrieval，附实际原句证据。提示次数和成功分类由服务器事件决定，答案泄露另作安全检查。任务失败不能等同于语法错误，正确语言未用词块不能伪造成功检索。

结构校验只验证可处理性。内容自动检查覆盖词块／关键词、正确正例、信息错位、目标使用和引用证据；对解释绝对化、隐含语义、学生水平及支架是否过强仍需人工复核。自动检查存在漏检，不能证明模型始终正确。矛盾维度、虚构引用、Schema失败及无可靠证据允许拒绝或无法评估。

H使用服务器真实执行的测试事件，摘要数字及evidenceIds必须匹配。初练成功单列practiceSuccessCount等；independentSuccessCount等只统计迁移。报告不冒充用户历史。

## 遥测和费用

每次请求记录operation、model、startedAt、latencyMs、status、errorCode、inputTokens、cachedInputTokens、outputTokens及estimatedUsd；不记录Key、访问码、请求头或真实学生完整输入。质量报告包含内置公开样例的模型回答，供人工检查，文件权限600、目录700、Git忽略；不要公开该目录。

估价=(未缓存输入×输入单价+缓存输入×缓存单价+输出×输出单价)/百万。缺usage或价格不可估时为null，不填0冒充已测费用；估价不覆盖所有区域／缓存写入等附加费用。actualBilledUsd始终null，直到从账户账单人工确认。

目前状态：**待执行**。模拟测试仅证明接口、防护和工具运行，不证明两个真实模型的教学表现。

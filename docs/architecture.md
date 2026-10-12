# v0.3.0 架构

保留第二阶段：React页面 → 同源Express API → 教学状态机 → Provider → Zod → 服务器决策 → 本地档案。新增官方OpenAI SDK和HTTP代理支持，浏览器验收使用轻量playwright-core，不新增状态框架。

Provider支持同步Mock或Promise，真实实现提供诊断、生成任务、语义评价和单轮对话；未来CozeProvider可复用。diagnose返回问题及动态Goal（词块、功能意义、等效框架）；generateTask返回私有参考和中文公开题目；evaluate返回意义／自然度／目标使用证据，不能直接生成历史或成功分类。

状态仍为awaiting / feedback / completed，kind区分diagnosis / initial / practice / transfer。模型给证据，状态机选择动作及根据真实提示／重试事件标记本题结果。正确表达不生成错误目标。

每轮in-flight锁、同键Promise共享、revision校验、成功命令幂等、失败键指纹保护。状态克隆后执行，所有内容及输出投影校验后原子提交。硬超时使调用context失效，取消上游并阻止忽略取消信号的迟到回调提交。reset也需要等待正在进行的操作，避免旧模型响应覆盖重置。

费用计数独立于教学事务，失败模型调用不写练习历史但计入调用预算，避免无限免费重试的错误假设。全局、每分钟及每轮限制都是单进程软计数；不能取代账户预算。

独立作答视图不返回feedback / record；公有任务只有id / kind / prompt / difficulty。生成题目拒绝Latin英语、明显提示、重复／高度近似文本和重复情境标识；参考及Goal留在服务端。文本过滤不是语义证明，质量需真实模型验收。

档案沿用v2，新增默认mock的provider字段兼容旧记录；v1迁移仍无检索成功。刷新读取临时服务端会话；重启失效并保留本地档案。没有持久服务端会话或多实例共享状态，本阶段以课程可运行原型为目标。

Coze是独立制作、单独发布的对照智能体，网页不再把它当作唯一AI后端。课程提交仍需保留其真实角色设定、开场语、发布链接和截图。

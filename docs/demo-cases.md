# v0.3.0 至少三个可复现端到端案例

以下三组使用 `AI_PROVIDER=mock`，不需要凭证、不产生模型费用。每组前先结束／重置现有轮。三个结果均已由状态机自动测试覆盖；三组均由真实Chromium在1440px和390px端到端执行。

## 案例一：搭配诊断 → 独立训练 → 首次迁移成功

1. 表达诊断 → 开始本轮 → 提交 `I want to learn more knowledge.`。
2. 看到collocation诊断，点击“针对性练习”。此时没有英语参考。
3. 天文学情境提交 `I want to gain knowledge about astronomy.`，点击“进入迁移检验”。
4. 烹饪情境提交 `I would like to acquire more knowledge about cooking.`。
5. 得到首次独立成功（仅本题）；结束。档案一轮、三次提交、一次迁移结果、提示0、重试0。
6. 可先增加情境变化，机器人主题回答 `I hope to learn about robotics.`，再结束。

## 案例二：部分成功 → 提示后迁移成功

1. 重复案例一的1–3。
2. 烹饪情境提交 `I want to learn more knowledge about cooking.` → 部分成功／搭配问题。
3. 点击“请求提示”，再提交 `I would like to learn about cooking.` → 提示后成功。
4. 结束，档案记录两次迁移作答（部分、提示后成功），提示1、重试1。
5. 若直接重复刚展示的 `I hope to learn more about cooking.`，标为copied_answer，不能认为独立检索。

## 案例三：情境失败 → 降低要求 → 重试成功

1. 重复案例一的1–3。
2. 烹饪情境输入 `I hope to learn about astronomy.` → 意图对象不符，失败。
3. 点击“降低难度再试”，输入 `I would like to learn about cooking.` → 重试成功。
4. 结束。提示0、重试1，两次迁移结果分别为失败／重试成功，不声称长期掌握。
5. 如果降低后仍回答天文学主题，两次失败后建议结束，不制造成功。

## 其他验证分支

- 正确诊断 `Could you help me with this assignment?` → no_issue，仅认可和结束，无训练目标或迁移成功。
- 情境训练 → 请求帮助 → `Would you mind sharing your notes with me?` → 酒店迁移 → `Could you please book a cab for me?`，不同表达框架和对象可通过。
- 开始后未作答直接重置 → 已停止，迁移结果为空。
- 反馈后刷新 → 恢复原状态、档案不重复。服务重启后刷新 → 会话失效、本地档案保留。

## 配置真实AI后的三组手动验收（尚未在线执行）

使用服务端OPENAI_API_KEY及OPENAI_MODEL、AI_PROVIDER=openai并重启。每次操作可能收费，动态内容与模型判断不保证完全相同。

1. **自由搭配目标**：填写“申请学术社团，说明希望增长专业知识”，提交 `I want to learn more knowledge about biology.`。检验是否区分搭配与语法、生成未泄露答案的新情境；按题目独立回答，再进入明显不同的迁移情境，尝试learn about等合理等效框架。检查AI是否认可意义和对象相符的等效表达。
2. **礼貌与关系**：填写“向不熟悉的导师礼貌请求延长作业期限”，提交 `Give me more time.`。应解释语境假设而不称语法错误。独立练习／迁移按各自场景作答，可用 `Would it be possible ...` 框架。不能因为与reference不同就判错。
3. **语法目标与正例保护**：填写“向新同学介绍很喜欢阅读”，提交 `I very like reading.`。检验语法诊断及新情境；主动请求提示后成功应计提示后。另开一轮提交 `I really enjoy reading novels.`，应允许no_issue而不制造目标。

所有真实案例需检查学生原意、模型假设、参考自然度与语义评估是否合理。模拟SDK测试只能证明接口和状态机制，不能证明真实模型质量。可先显式运行RUN_LIVE_AI=1的冒烟（最多2次请求），再用网页进行上述人工验收。

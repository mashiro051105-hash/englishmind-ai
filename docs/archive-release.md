# GitHub 归档与 v1.0 发布操作

本项目保留本地Git历史。作者补充授权后已创建GitHub空仓库，后续推送及Release以验收报告为准。以下步骤由作者在确认账号、许可及发布范围后执行；准备文件不等于已经发布。

## 本地归档

检查 `git status`、`git log --oneline --decorate` 和 `npm run security:check`。在检查后的本地提交上运行：

```bash
npm run archive
```

生成 `exports/englishmind-ai-v0.5.0.zip`、SHA-256 和带提交 ID 的清单。只归档已提交、已跟踪源文件；工作区未提交时拒绝导出。依赖、dist、真实 .env、证书、日志、临时报告和 Git 元数据不在 ZIP 中。解压后 `npm ci --include=dev` 即可安装并构建。截图仅用 Mock 预设文本，不含真实学生资料。

ZIP 不含历史；需要长期保存历史时另行制作本地备份：

```bash
git bundle create exports/englishmind-ai-history.bundle --all
git bundle verify exports/englishmind-ai-history.bundle
```

Bundle 包含所有历史，分享前检查过去提交是否含敏感内容。不要直接上传整个工作目录。报告可能含测试输出，默认不归档。

## GitHub（尚未执行）

1. 作者登录 GitHub，自行创建空仓库；可先设为 Private。不要勾选生成 README 以免额外合并。
2. 确认作者身份、仓库可见性、课程材料公开范围及开源许可证。当前未选择许可证，不能宣称已获开源许可。
3. 在本地检查 `git remote -v`，确认没有重复远程；用自己的真实仓库 URL 执行：

```bash
git remote add origin <作者创建的实际仓库URL>
git push -u origin main
git push origin --tags
```

4. 检查 README 图片、CHANGELOG、默认分支和无密钥记录。可创建 v0.5.0 Release，附 ZIP 与校验文件；不填写虚假演示链接。

以上命令是操作说明，本阶段没有运行远程操作。不要把访问令牌嵌入 remote URL。

## Render Free（尚未执行）

按 [deployment.md](deployment.md) 将仓库连接 Render，选择现有 Blueprint `render.yaml`。保持 `AI_PROVIDER=mock`、`ENABLE_PAID_AI=0`、`numInstances=1`。构建安装包含 devDependencies，因为生产使用 tsx；Express 同源提供 dist 与 /api。平台提供 PORT，服务监听 0.0.0.0。

Render 外部 HTTPS URL 必须与 PUBLIC_ORIGIN 一致，或使用自动的 RENDER_EXTERNAL_URL；SESSION_COOKIE_SECRET 至少32字符，生产 Cookie 为 Secure/HttpOnly/SameSite=Strict。健康检查 `/api/ready` 只检查配置，不调用模型。

免费服务会休眠，唤醒等待，重启后内存会话消失；页面提示重新开始，浏览器档案保留。禁止扩到多个实例或换无状态 serverless。免费额度及潜在流量/构建费用以部署当日官方条款为准；不主动升级付费计划。

## v1.0.0 必要关卡

- 零余额路径：作者手动安装Ollama和一个本地模型，按 [Windows本地AI指南](ollama-windows.md) 完成真实推理与A–H人工复核。不要求充值。未来若选择OpenAI，再提供服务端Key、余额及明确收费授权；不要先开放收费网页。
- 人工复核 A–H 的英语及教学质量，保存脱敏报告、真实 token 与账单核对；不只看 Schema。
- 作者确认 GitHub 账号、许可和公开范围，再自行推送或明确授权；确认 Render 账号及免费额度，再发布 Mock。
- 取得真实可访问链接后验收 HTTPS、Cookie、生产教学闭环、移动端、休眠唤醒及档案清空；在 README 补实际链接。
- Coze 对照智能体由作者独立制作、发布、截图；课程要求的扣子链接不能由本应用替代。

真实 AI 若以后开放，仅在明确授权后设 ENABLE_PAID_AI=1、独立随机访问码及较小 AI_MAX_TOTAL_CALLS；进程重启会重置预算，必须另设账户预算/告警。默认公开演示继续 Mock。

## 本轮平台权限实测与下一步

已用GitHub CLI验证登录账号为 mashiro051105-hash，但实际创建 englishmind-ai 被GitHub集成拒绝：`Resource not accessible by integration (createRepository)`。该次创建尝试失败。作者随后创建并授权仓库，API已确认 https://github.com/mashiro051105-hash/englishmind-ai 为公开仓库且当前集成有push权限。Render没有已配置凭证/连接，尚未创建任何实例。

作者最少需要做：

1. 登录 https://github.com/new，owner选择 mashiro051105-hash，创建空 englishmind-ai（Public用于展示；不要添加README、.gitignore或许可证）。
2. 在GitHub的Codex集成授权设置中允许访问此仓库；提供真实URL。若集成不能写入历史/Release，需要作者在本机GitHub CLI登录后执行推送/Release，不在聊天中贴令牌。
3. 登录 https://dashboard.render.com，连接GitHub并允许Render访问该仓库。选择Blueprint，使用render.yaml，确认Free、Mock、单实例、ENABLE_PAID_AI=0。不要升级计划、绑定模型Key或添加付费资源。
4. 提供Render实际服务URL后再验证HTTPS与教学闭环；没有实际服务前不填占位公开链接。

v1.0.0发布草稿正文已存 `docs/release-v1.0.0.md`。仓库已存在、推送成功且具备Release权限时，可创建真实GitHub草稿（不是正式发布）：

```bash
gh release create v1.0.0 --repo <真实owner/repository> --draft --target main --title 'EnglishMind AI v1.0.0 — 演示发布草稿' --notes-file docs/release-v1.0.0.md exports/englishmind-ai-v0.5.0.zip exports/englishmind-ai-v0.5.0.zip.sha256 exports/englishmind-ai-v0.5.0.zip.manifest.json
```

作者完成仓库创建与授权后，现已成功推送main及原历史标签，并创建实际v1.0.0 Draft Release；附件上传被GitHub上传端点401拒绝；ZIP、校验文件及清单已本地生成并验证，需要作者登录草稿页手动上传。该草稿仅授权账号可见，尚未正式发布。完成公开部署/本地验收后再修订正文和决定正式发布；开发源码保持v0.5.0，不凭空把测试版本标为已验收v1.0.0。

附件手工操作：从本地exports下载ZIP、.sha256和.manifest.json，登录GitHub仓库Releases页打开v1.0.0 Draft，在附件区选择三个文件并保存Draft。不要先点击Publish release；公开网站和模型验收仍未完成。

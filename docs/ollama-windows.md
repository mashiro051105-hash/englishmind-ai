# Windows 零 API 余额本地 AI

已实现独立 OllamaProvider，使用 Ollama 官方 `/api/chat`，直接传 JSON Schema、`stream:false`、`think:false`。复用 OpenAIProvider 的诊断/任务/评价/总结内容约束，换用本机传输；不会访问 OpenAI、不需要 Key，不会下载模型。默认仍 Mock，Render 仍只能部署 Mock 或另行授权的 OpenAI；Ollama 在生产环境拒绝启用。

本版只完成协议模拟与教学状态机测试。本环境没有 Ollama / NVIDIA GPU，未进行真实本地模型推理。Schema 合格不代表英语或教学质量合格。

## 显卡与候选模型

RTX 4060 Laptop 8GB 属受支持的 NVIDIA 显卡；实际可用显存受桌面、浏览器、共享 GPU 应用和驱动影响。建议至少16GB系统内存（32GB更从容）、SSD、交流电源。以下为2026-10-12核对官方模型库的下载大小，不是精确峰值显存：

| 模型 | 官方标签量化 / 权重下载 | 建议 |
|---|---|---|
| `qwen3:4b` | Q4_K_M / 约2.5GB | 首选，4K上下文，关闭思考，8GB显存余量较大 |
| `qwen2.5:7b` | Q4_K_M / 约4.7GB | 次选，结构化任务候选；需实测英语质量 |
| `qwen3:8b` | Q4_K_M / 约5.2GB | 可尝试，4K上下文；8GB可能因缓存/其他进程溢出到CPU |

4B推理可初步预留约4–6GB显存，7B/8B约6–8GB甚至更高，仅为部署估计，不是本项目实测。上下文、输出长度、Ollama版本、分配与驱动会改变用量。不推荐本阶段14B或更大模型。一次只下载一个模型；Ollama安装本身官方要求至少4GB磁盘，首个4B模型加项目/缓存建议先留10–15GB空闲。不要把权重加入Git/ZIP。

## 安装与准备（由用户手动执行）

1. 更新 NVIDIA 驱动。官方 Windows 要求 Windows10 22H2或更新，NVIDIA驱动551.61或更新；Windows11可用。运行 `nvidia-smi` 确认显卡和驱动。GPU不可用也可能CPU推理，但会更慢。
2. 从 https://ollama.com/download/windows 下载官方安装程序并安装，重新打开 PowerShell。
3. Ollama通常由托盘程序自动启动，API在 `http://127.0.0.1:11434`。检查：

```powershell
ollama --version
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

如果服务未运行，单独打开终端运行 `ollama serve`；若提示端口被占用，先检查托盘实例，不要同时启动两份。

4. 明确决定下载首个模型（下列命令会下载约2.5GB）：

```powershell
ollama pull qwen3:4b
ollama list
ollama show qwen3:4b
```

实际标签内容可能更新；以 `ollama show` 的量化和大小为准。不要使用带 `cloud` 的模型，它可能需要云服务；本应用明确拒绝这类模型。

5. 用短请求预热并关闭思考，检查真实本机输出及GPU驻留：

```powershell
$body = @{ model = 'qwen3:4b'; stream = $false; think = $false; messages = @(@{ role = 'user'; content = 'Say hello in one short English sentence.' }); options = @{ num_ctx = 4096; num_predict = 80 } } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/chat -Method Post -ContentType 'application/json' -Body $body
ollama ps
nvidia-smi
```

检查 `ollama ps` 的CPU/GPU信息；若仅CPU、严重变慢或显存不足，关闭其他GPU应用，先用4B/4096上下文。首次加载比热推理慢，预热成功再进网页。

## 启动 EnglishMind

安装 Node22.19+（本版验证24.19），解压项目或使用现有工程，PowerShell进入项目所在目录：

```powershell
npm ci --include=dev
Copy-Item .env.ollama.example .env.ollama
$env:DOTENV_CONFIG_PATH = '.env.ollama'
npm run dev
```

这不会覆盖已有 `.env`。打开 http://localhost:5173 ，顶部必须显示“本地 Ollama”和 LOCAL AI。模板无 API Key、ENABLE_PAID_AI=0；本地模式不走收费访问码。11434由Express服务端调用，浏览器仍只访问自己的 /api，不直接访问Ollama。

模板：`OLLAMA_MODEL=qwen3:4b`、`OLLAMA_NUM_CTX=4096`、`OLLAMA_TIMEOUT_MS=90000`。请求最多90秒，可配置到120秒；本地服务端操作保护125秒、客户端135秒；并发锁/重复提交/取消/迟到结果保护保留。失败不回退Mock，不算成功。每进程默认调用上限12，模板给本机100，每轮仍30；到达上限可结束训练，重启后计数重置。

若模型超时或结构不合格，不要快速连点；同步状态，缩短输入、预热、查看显存后重试。标准输出日志不含学生全文。思考内容不展示；模型拒答/跑题会因Schema或一致性检查失败，允许未评估，不能强制当作合格教学。

## A–H 本地质量验收

默认 `npm run quality:local` 只打印计划，不连接Ollama。手动准备后启用少量真实本地测试：

```powershell
$env:DOTENV_CONFIG_PATH = '.env.ollama'
$env:RUN_LOCAL_AI = '1'
$env:QUALITY_MAX_REQUESTS = '10'
npm run quality:local
Remove-Item Env:RUN_LOCAL_AI
```

不需要付费授权开关或OpenAI余额；最多12次，可降低预算。通常A–H为8次本地模型请求，未设置或模型不存在即停止，不下载补齐。Ctrl+C中止，保留部分脱敏报告到忽略的 `.artifacts/`。记录可获得的模型、延迟、token和每项检查；外部API调用/费用为0，不代表电费和硬件成本为0。结果必须人工核对[ai-quality.md](ai-quality.md)的A–H准确性、自然度、情境信息、检索证据、提示与总结，不只看JSON。

## 切换、存储及退出

- 换模型：用户先 `ollama pull qwen2.5:7b`（约4.7GB），再改 `.env.ollama` 的 OLLAMA_MODEL，停止并重启应用。不要一次下载全部候选。
- 换回Mock：停止应用，`Remove-Item Env:DOTENV_CONFIG_PATH`，确认默认 `.env` 中 AI_PROVIDER=mock 后重启；或显式 `$env:AI_PROVIDER='mock'`。如果临时设置了该变量，之后 `Remove-Item Env:AI_PROVIDER`。
- `ollama stop qwen3:4b` 卸载驻留内存；`ollama rm qwen3:4b` 删除权重。Windows默认模型目录 `%USERPROFILE%\.ollama\models`。换磁盘可设置用户环境变量 OLLAMA_MODELS，完全退出托盘再启动；目录管理以官方文档为准。
- 保持OLLAMA_HOST默认本机，不开放11434到公网。开发服务器仅本人在localhost使用，不转发端口或开放Windows公网防火墙。Render中的localhost指云实例，不是你的Windows笔记本。
- 模型切换/服务端重启导致内存会话失效；本地档案保留，但不同模型应从新一轮开始，不虚构可比历史表现。

## 官方资料（2026-10-12核对）

- https://docs.ollama.com/windows
- https://docs.ollama.com/gpu
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/capabilities/structured-outputs （云端不支持本方案结构化输出）
- https://ollama.com/library/qwen3:4b
- https://ollama.com/library/qwen3:8b
- https://ollama.com/library/qwen2.5:7b

没有实际测得的tokens/s、4060峰值显存或英语质量成绩；以上硬件可行性不能替代你的实机验收。模型权重有各自许可证，项目代码许可证仍由作者选择。

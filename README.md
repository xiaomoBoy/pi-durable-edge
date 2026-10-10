# Pi Durable Edge

基于 **Cloudflare Workers + SQLite-backed Durable Objects + PiHarness** 的持久化个人 Agent。独立维护的 Cloudflare 版本，源自 [Pi Durable Assistant](https://github.com/xiaomoBoy/pi-durable-assistant)。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge)

**[中文部署教程](docs/DEPLOY.md)** · [发布审查与测试矩阵](docs/RELEASE_CHECKLIST.md) · [后续路线图](docs/V02_PLAN.md)

> **v0.2.1**：已通过单元测试、Wrangler 打包和本地 Durable Object HTTP 集成测试；Cloudflare 账户的远端部署、真实 OpenAI/Anthropic API 和崩溃恢复仍待实测。

## 功能

- **原版 UI**：复用 Pi Durable Assistant 的三栏布局、消息气泡、响应式样式和“小 D”吉祥物。
- **模型配置**：OpenAI Chat Completions / Responses、Anthropic Messages 和 Faux；支持 HTTPS Base URL、API Key、模型 ID、上下文窗口、输出 Token 和推理标记。API Key 在服务端加密保存，配置查询不会返回明文。
- **持久聊天**：通过 PiHarness 提交消息并保存记录，可刷新后继续查看。
- **持久定时提醒**：Cloudflare Agents Scheduler 到期唤醒，网页上记录提醒状态。
- **免费验证**：Faux 采用固定脚本，延迟 12 秒后回复；不调用收费模型。真实模型产生的费用由对应 API 提供商收取。

当前为单用户、单 Durable Object；多会话、子 Agent、附件、停止任务和微信桥尚未实现，UI 不显示无对应后端能力的操作入口。

## 新建部署：先决定是否需要再创建 GitHub 副本

**自己已经有 `xiaomoBoy/pi-durable-edge` 仓库（项目维护者，推荐）：**不要点击上方部署按钮重复复制仓库。到 Cloudflare 控制台 **Workers & Pages → Create application → Import a repository**，选择 `xiaomoBoy/pi-durable-edge`，`main` 分支，根目录 `/`，部署命令 `npm run deploy`。这样连接的是当前仓库，之后 push 自动触发正常构建。

**其他用户（真正的一键部署）：**点击上面的 **Deploy to Cloudflare**，授权 GitHub 并部署。官方按钮**会在你的 GitHub 账户创建一个新的仓库副本**，再为其创建 Worker 和 Durable Object；这不是对已有构建的“重试”。<a href="https://developers.cloudflare.com/workers/platform/deploy-buttons/">Cloudflare 官方说明</a>。

首次部署请填写自己生成的 **`ACCESS_TOKEN`**（至少 24 字符的随机字符串）。如果部署界面未提示填写，在 Worker 的 **Settings → Variables and Secrets** 添加 Secret `ACCESS_TOKEN`，不要用 GitHub Token/Cloudflare Token 代替。

完成后打开 Cloudflare 给出的 `workers.dev` 地址，输入同一个 `ACCESS_TOKEN`；在 Faux 模式点击 **一键功能自检**。再按需在右侧模型配置中添加自己的 API。

**重要：**从一键部署按钮创建的第一条构建是 `seed_repo override`，不能用 **Retry build** 重跑。新代码应提交到它**实际关联的 GitHub 仓库**，由新 commit 触发构建。完整说明、授权修复及 Wrangler 备用方案见 [部署教程](docs/DEPLOY.md)。

## v0.2.1 质量审查

- 限制 JSON 请求体到 16 KiB；无效输入在 Durable Object RPC 跨边界后仍返回正确 4xx。
- 模型切换加互斥和回滚；自定义 API Base URL 禁止 HTTP、IP 和本地域名。
- 模型 Key 加密并隐藏，内部运行错误脱敏；静态页面新增同源 CSP 和禁缓存响应头。
- CI 增加真正的 **Wrangler 本地 Worker / Durable Object** HTTP 测试，覆盖 Faux 对话、幂等、Alarm 和无付费请求的模型配置切换。

[完整回归清单、风险与远端测试步骤](docs/RELEASE_CHECKLIST.md)。

## 本地验证

```bash
git clone https://github.com/xiaomoBoy/pi-durable-edge.git
cd pi-durable-edge
npm install
npm run check
cp .dev.vars.example .dev.vars
# 将 .dev.vars 内 ACCESS_TOKEN 换成至少 24 字符的个人随机密钥
npm run dev
```

## API（均须携带 `Authorization: Bearer <ACCESS_TOKEN>`）

| 路由 | 用途 |
| --- | --- |
| `GET /api/state` | 聊天记录、运行任务、提醒 |
| `GET /api/model` | 获取不含明文密钥的模型配置 |
| `PUT /api/model` | 保存并启用模型 |
| `POST /api/chat` | 提交幂等任务：`text`、`operationId` |
| `POST /api/reminders` | 提交延迟提醒：`text`、`seconds` |

平台免费额度受 Workers、Durable Objects 和数据库资源限制；PiHarness Beta 兼容性需要线上测试。新部署的 Durable Object 是新数据空间，旧 Worker 删除后的历史记录不能自动恢复。

# Pi Durable Edge v0.2.1：部署、更新与故障排查

## 先理解两个不同的“部署”

| 场景 | 推荐入口 | GitHub 仓库 |
| --- | --- | --- |
| **维护者已有 `xiaomoBoy/pi-durable-edge`** | Cloudflare 控制台 **Import a repository** | 直接关联现有仓库，不复制 |
| 其他用户安装开源项目 | [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge) | Cloudflare 创建一个新的仓库副本 |

**如果之前的 Worker 已经删除，直接采用第一种方式。** 一键部署按钮本身适合开源分享，但会通过 `seed_repo override` 复制仓库，因此初次构建不支持 **Retry build**。这不是代码编译错误；不要对那次初次构建反复尝试重试。

## 1. 使用现有 GitHub 仓库重新创建 Worker（推荐）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create application → Import a repository**。
2. 选择 GitHub 账户与仓库 [`xiaomoBoy/pi-durable-edge`](https://github.com/xiaomoBoy/pi-durable-edge)。如看不到仓库，先检查 GitHub App 授权。
3. 选择生产分支 **`main`**，应用名称 **`pi-durable-edge`**（应与 `wrangler.jsonc` 的 `name` 相同）。
4. 构建参数使用下表。注意这是独立根目录项目，**不是** `pi-durable-assistant/cloudflare` 子目录。
5. 选择 **Save and Deploy / 部署**，确认 Worker 与 SQLite-backed Durable Object `Assistant` 被创建。
6. 首次打开 Worker URL 时输入你设置的 `ACCESS_TOKEN`，使用 Faux 模式完成验证；真实 OpenAI/Anthropic Key 后续从网页配置即可。

| 配置 | 值 |
| --- | --- |
| Repository | `xiaomoBoy/pi-durable-edge` |
| Branch | `main` |
| Root directory | `/` |
| Build command | `npm run check`（可选，推荐） |
| Deploy command | `npm run deploy` 或 `npx wrangler deploy` |
| Worker name | `pi-durable-edge` |
| Worker runtime | 按 `wrangler.jsonc` 自动配置 |

Cloudflare 会根据 `wrangler.jsonc` 配置 Durable Object 的类与迁移，不需要手动创建 D1、R2、KV 或 Containers。部署项目名必须与 Wrangler 的 Worker 名一致。参考 [Cloudflare Workers Builds 官方文档](https://developers.cloudflare.com/workers/ci-cd/builds/)。

### 首次配置 ACCESS_TOKEN

它是**你的应用访问密钥**，不是 GitHub 或 Cloudflare 平台的 API Token。建议用密码管理器生成，或者在本地运行：

```bash
openssl rand -hex 24
```

一键部署的初始化界面如果出现 `ACCESS_TOKEN`，可直接填写；**Import existing repository** 如果未要求输入，需要在 Cloudflare 控制台 **Workers & Pages → pi-durable-edge → Settings → Variables and Secrets** 新增同名 **Secret**（至少 24 字符），保存并发布。打开网页输入同一个密钥。不要将密钥放进 `wrangler.jsonc`、Github 或 Issue。

`GET /api/model` 不回传明文 API Key。后续如果更换 `ACCESS_TOKEN`，用于加密模型 Key 的派生密钥也会变化，需要重新保存模型 API Key。

## 2. 其他用户的一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge)

Cloudflare 将**创建新的 GitHub 仓库副本**并连接 Workers Builds；以后修改这个副本的 `main` 分支，会触发正常构建。上游 `xiaomoBoy/pi-durable-edge` 的新提交**不会自动同步**到你的副本，需要自行合并或同步。

如果 GitHub 上已经有一个同名仓库，导入时可选择其他副本仓库名；不要误以为重新点按钮会刷新已有 Worker。

## 3. 验收

[发布前回归与远端待测清单](RELEASE_CHECKLIST.md)。本地 Wrangler 烟雾测试通过，不等于真实 Cloudflare 账户与真实模型 API 已通过。


1. 打开 `workers.dev` URL，输入 `ACCESS_TOKEN` 并连接。
2. Faux 模式点击 **一键功能自检**：检查持久化聊天、幂等 operationId、SQLite 状态和持久提醒（最长 60 秒）。
3. 刷新浏览器，确认历史存在；注意刷新网页不等于测试 Worker 崩溃。
4. 在右侧模型设置选择 OpenAI Chat Completions / Responses 或 Anthropic Messages；填写可信的 HTTPS Base URL、模型 ID 和私有 API Key。真实调用可能收费，首次只发一条短消息测试。
5. 必须另外测试 Cloudflare 实际运行和中断恢复；GitHub Actions 通过或 Wrangler dry-run 成功不代表线上模型请求一定成功。

## 4. 常见错误

| 提示 | 处理 |
| --- | --- |
| `Cannot retry a build that was created with a seed_repo override` | 种子构建不能重试。**不用 Retry**。提交新代码到实际关联 Git 仓库，让正常新构建触发；若已删除 Worker，则按第 1 节新建并连接现有仓库 |
| `Your GitHub authorization has expired` | Cloudflare GitHub App 授权过期。先在 [GitHub Installed Apps](https://github.com/settings/installations) 检查 `Cloudflare Workers and Pages`，按 [Cloudflare 重装授权指引](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#reinstall-the-cloudflare-github-app) 重新安装。仓库代码无法代替你完成 GitHub 授权 |
| `Worker name ... must match` | Cloudflare 创建的 Worker 名必须与 `wrangler.jsonc` 的 `pi-durable-edge` 一致 |
| API `503` | 未设置 `ACCESS_TOKEN` 或长度少于 24 |
| API `401` | 网站输入的访问密钥与 Worker Secret 不一致 |
| GitHub 有新提交但 Cloudflare 没更新 | 检查 Worker **Settings → Builds → Git Repository** 是否连接到 `xiaomoBoy/pi-durable-edge` 的 `main`；不是指向已删除项目或旧仓库 |
| Runtime `500` | 检查 Worker **Observability / Logs**；可能是 PiHarness Beta、Durable Object SQLite 或模型 Provider 兼容问题；请隐去 API Key 后再分享日志 |

**注意：**卸载 Cloudflare GitHub App 可能暂时影响账号下其他项目的自动构建；如已有其他项目在用，先评估影响。GitHub App 授权失败是 Cloudflare/GitHub 账户层面问题，不是可以仅靠修改项目代码修复的错误。

## 5. GitHub 授权有问题时，用 Wrangler 直接部署

```bash
git clone https://github.com/xiaomoBoy/pi-durable-edge.git
cd pi-durable-edge
npm install
npm run check
npx wrangler login
npm run deploy
npx wrangler secret put ACCESS_TOKEN
```

这条路不需要 Cloudflare GitHub App，但不会自动建立 GitHub → Cloudflare 自动部署；后续若要自动部署，再去 Worker **Settings → Builds** 连接 GitHub 仓库。

## 6. 持续维护

在已有 GitHub 集成正常的情况下，每次提交至当前**实际关联仓库**的 `main`，Cloudflare 就会自动执行构建部署。GitHub Actions 仅执行测试和 Wrangler dry-run，不存储 Cloudflare 的账户 API Token，也不直接创建或删除 Worker。

删除旧 Worker 后重新创建的 Durable Object **是新的存储空间**；旧任务、消息和已保存模型配置不能假设会自动恢复。不要将新安装误认为原实例的原地升级。

项目源码：[pi-durable-edge](https://github.com/xiaomoBoy/pi-durable-edge) · [PiHarness](https://developers.cloudflare.com/agents/harnesses/pi/) · [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)。

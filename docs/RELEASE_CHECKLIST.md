# Pi Durable Edge v0.2.1 发布审查与回归清单

> 此文档仅用于独立仓库 `xiaomoBoy/pi-durable-edge`。不修改、不发布 VPS/Docker 版 `pi-durable-assistant`。
> **测试范围分为自动化本地模拟和真实 Cloudflare 远端部署，不能相互代替。**

## 本轮审查任务与完成条件

| 优先级 | 工作项 | 自动化验收 | 进度 |
| --- | --- | --- | --- |
| P0 | 客户端错误在 DO RPC 后保留 400/409 状态 | 本地 Wrangler HTTP 断言无效参数返回 4xx | 已编码，CI 判定 |
| P0 | 模型配置存储失败与 Provider 切换回滚 | 当前模型切换逻辑互斥、旧 Provider 可恢复 | 已编码，需线上异常注入补测 |
| P0 | 防止密钥被回传或记录到 Workers 日志 | GET 配置不含 Key、API 内部错误脱敏 | 已编码，CI 判定 |
| P0 | SSRF 防护基本面 | 禁 HTTP/IP/localhost/内网域名、允许公网 HTTPS | 已编码，单测覆盖；DNS 重绑定仍需审计 |
| P0 | 防止超大请求和错误类型混淆 | JSON 请求按字节限制到 16 KiB，返回 400/413/415 | 已编码，单测覆盖 |
| P0 | 原版 Faux / 持久化逻辑 | Wrangler 本地 DO 跑 12 秒、幂等提交、Alarm | 已编码，CI 判定 |
| P0 | Model Provider 状态切换 | 本地 DO 保存假 Key、读取隐藏、无 Key 修改模型、切回 Faux | 已编码，CI 判定 |
| P1 | 前端基本安全响应头 | 同源 CSP、no-cache、禁 iframe、no-referrer | 已提交 |
| P1 | 发布流程与持续回归 | PR 通过 Node 测试、dry-run、Wrangler 本地 smoke，再合并 main | 已配置 |

## CI 运行方式

```bash
npm install
npm run check           # Node 语法 + 纯单元测试 + UI 结构
npx wrangler deploy --dry-run --outdir dist-cf
npm run test:smoke      # 启动 Wrangler 本地 Agent + SQLite-backed Durable Object
```

`test:smoke` 使用 **Faux 和虚构 API Key**，不调用外部付费模型、不需要 Cloudflare 账户。它通过真实 Worker HTTP/RPC 依次验收鉴权、静态页面、无效输入 4xx、任务幂等、Faux 回复、定时 Alarm、Pi 会话模型切换与加密配置保存。每次在 CI 创建隔离的 `.wrangler/smoke-v02`，测试结束关闭本地进程并移除临时 `.dev.vars`。

**不应从本地模拟通过推断生产环境完全可用。** PiHarness Beta 和 Cloudflare 免费套餐存在运行时、CPU、会话和报警调度限制。

## 首次 Cloudflare 实际部署（需要维护者）

1. 按 [DEPLOY.md](DEPLOY.md) 从**本独立仓库**的 `main` 创建 Worker，并配置 `ACCESS_TOKEN` Secret。
2. 用部署地址验证首页、移动端、响应头和登录。新建 Worker 将拥有**全新的 SQLite 存储**。
3. 切到 Faux，测试一次任务 12 秒完成、刷新页面后存在、提醒到点变成 fired。
4. 选择 OpenAI Chat Completions，输入可用的 HTTPS Base URL、自己的 API Key 和有权限的模型 ID，发送一个极短请求。再测 OpenAI Responses 和 Anthropic Messages。**调用可能收费**，每次请求前确认额度。
5. 远端测试错误 Key（401/403）、错误模型（404）、限速（429）、服务超时和 Worker 重新部署后的会话恢复；日志不可出现完整 Key。
6. 测试在任务运行中进行新版本部署，确认从检查点恢复、无重复提醒。**关闭浏览器不是崩溃测试**。
7. 检查 Cloudflare CPU/DO/SQLite 使用配额与免费套餐是否足够；必要时降低轮询频率。
8. 如果失败，复制去除 Key/账户标识的 Workers 日志，优先排查 Beta 兼容，不要直接升级付费套餐。

## 本轮未做、但需要继续跟踪

- **高优先级**：真实 Cloudflare 账户端到端测试；真实 OpenAI / Anthropic API 响应和第三方兼容协议差异；恢复中进行模型切换的故障注入。
- **中优先级**：SSE 或 WebSocket 流式输出（现在是短时间状态轮询）；长对话压缩与上下文上限；清除会话；API 请求次数和 Token 用量可观测性。
- **长期**：多模型 Profile、密钥轮换独立于 ACCESS_TOKEN、备份与导出、多会话、todo/memo 和有限制的子 Agent。
- **安全限制**：自定义 HTTPS 域名可能经 DNS 解析为非预期地址（DNS 重绑定），目前仅在 URL 语法层禁止常见内网目标；不适用于无信任的多租户开放代理。上线多人版前需做专门的 SSRF/限流/身份体系评估。

## 已知产品边界

- Cloudflare Free 不等于 OpenAI/Anthropic API 免费。
- 切到 Faux 会删除已保存的真实模型密钥，切回来需要重新输入。
- 单用户、单 Durable Object，暂无多会话或附件。
- PiHarness 仍是 Beta。任何 CI 结果只能反映其对应版本和本地模拟器环境。

## 版本结论

只有 **独立仓库 main 分支 CI 全部成功**，才能称为「源代码及本地 Workers 回归检查通过」。真实 Cloudflare 部署和付费模型 API **必须另行验收**，否则不能称为已上线验证。

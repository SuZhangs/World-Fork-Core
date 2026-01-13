以下为基于源码/配置的“全量审计 + 差距分析 + 下一阶段路线图”。所有结论均以仓库代码为唯一事实来源，并给出证据。  

---

## A. 仓库结构概览（关键目录/文件 + 作用）
- `src/core/`：纯函数核心算法层（diff/merge/json pointer/types）。【F:src/core/diff.ts†L1-L65】【F:src/core/merge.ts†L1-L120】【F:src/core/jsonPointer.ts†L1-L19】【F:src/core/types.ts†L1-L63】
- `src/repo/`：Prisma 数据访问层（world/branch/commit/unit）。【F:src/repo/worldRepo.ts†L1-L60】【F:src/repo/branchRepo.ts†L1-L54】【F:src/repo/commitRepo.ts†L1-L132】【F:src/repo/unitRepo.ts†L1-L164】
- `src/server/`：Fastify API 层（路由、校验、错误、鉴权、OpenAPI/Swagger）。【F:src/server/app.ts†L1-L1497】【F:src/server/plugins/auth.ts†L1-L62】【F:src/server/errors.ts†L1-L7】【F:src/server/ref.ts†L1-L20】
- `openapi/openapi.json`：导出的 OpenAPI 契约（由 Swagger 生成）。【F:openapi/openapi.json†L1-L120】
- `packages/sdk/`：基于 OpenAPI 的 TS SDK（openapi-fetch + openapi-typescript）。【F:packages/sdk/src/index.ts†L1-L197】【F:packages/sdk/package.json†L1-L39】
- `prisma/schema.prisma`：数据模型（World/Branch/Commit/Unit/UnitSnapshot/UnitState/ApiKey）。【F:prisma/schema.prisma†L1-L96】
- `scripts/`：OpenAPI 导出 & API key 创建脚本。【F:scripts/export-openapi.ts†L1-L18】【F:scripts/create-api-key.ts†L1-L30】
- `src/**/__tests__/`：核心算法 & API 集成测试（Vitest）。【F:src/core/__tests__/diff.test.ts†L1-L55】【F:src/core/__tests__/merge.test.ts†L1-L52】【F:src/server/__tests__/read-api.test.ts†L1-L288】【F:src/server/__tests__/write-api.test.ts†L1-L384】
- `.github/workflows/`：CI 与发布流程（OpenAPI 检查、SDK 构建、测试、发布）。【F:.github/workflows/ci.yml†L1-L35】【F:.github/workflows/publish-sdk.yml†L1-L61】

---

## B. 架构分层与依赖方向（文字图）
```
[Core (pure)]  diff/merge/jsonPointer/types
        ↑
[Repo] prisma access (world/branch/commit/unit)
        ↑
[Server] Fastify routes + auth + OpenAPI
        ↑
[OpenAPI export] / openapi/openapi.json
        ↑
[SDK] openapi-fetch client + types
```
- **应保持纯函数**：`src/core/*` 当前仅依赖类型与 JSON Pointer 转换，具备纯函数特性，适合长期作为“确定性内核”。【F:src/core/diff.ts†L1-L65】【F:src/core/merge.ts†L1-L120】【F:src/core/jsonPointer.ts†L1-L19】

---

## C. 能力全量清单（发现式）
> 状态：已完成 / 部分完成 / 未开始 / 实现但未文档化 / 文档写了但实现缺失

| 分类 | 能力项 | 状态 | 证据 | 备注 |
|---|---|---|---|---|
| 核心版本控制 | World/Branch/Commit/Unit 数据模型 | 已完成 | Prisma 模型定义完整。【F:prisma/schema.prisma†L10-L96】 | v0.1 核心结构已具备 |
| 核心版本控制 | 分支工作区（UnitState）+ Commit 快照（UnitSnapshot） | 已完成 | 提交/合并时创建快照，工作区可更新。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1422-L1466】 | 符合“快照+工作区”设计 |
| 核心版本控制 | Diff（字段级 + JSON Pointer） | 已完成 | diffUnits + JSON Pointer 转换。【F:src/core/diff.ts†L1-L65】【F:src/core/jsonPointer.ts†L1-L19】 | 纯函数易扩展 |
| 核心版本控制 | Merge（三方合并 + 冲突） | 已完成 | mergeUnits + merge route 预览/应用。【F:src/core/merge.ts†L1-L120】【F:src/server/app.ts†L1298-L1495】 | 冲突信息补充了上下文 |
| 核心版本控制 | Commit DAG（双亲 merge commit） | 已完成 | Commit 支持 parentCommitId2，merge commit 写入双亲。【F:prisma/schema.prisma†L48-L62】【F:src/server/app.ts†L1422-L1429】 | DAG 可扩展 |
| 核心版本控制 | 历史遍历仅沿第一父链 | 部分完成 | listCommitsByBranchHead 只遍历 first parent。【F:src/repo/commitRepo.ts†L74-L107】 | 未来需要 DAG 全量遍历/可视化 |
| 开发者集成 | OpenAPI 自动生成 & /openapi.json | 已完成 | Fastify swagger + openapi.json 输出。【F:src/server/app.ts†L448-L498】【F:openapi/openapi.json†L1-L33】 | 契约中心化 |
| 开发者集成 | OpenAPI 校验与“未同步即失败”护栏 | 已完成 | openapi:check 脚本 + CI 执行。【F:package.json†L9-L18】【F:.github/workflows/ci.yml†L22-L35】 | 有合同护栏 |
| 开发者集成 | SDK 生成与封装 | 已完成 | SDK 基于 OpenAPI types + openapi-fetch。【F:packages/sdk/src/index.ts†L1-L197】【F:packages/sdk/package.json†L1-L39】 | |
| 开发者集成 | 错误码统一结构 | 已完成 | errorResponse + schema 使用。【F:src/server/errors.ts†L1-L7】【F:src/server/app.ts†L43-L49】 | |
| 安全与隔离 | API Key 鉴权 + SHA-256 Hash | 已完成 | API Key hash 校验 + revokedAt 判断。【F:src/server/plugins/auth.ts†L43-L58】【F:prisma/schema.prisma†L23-L33】 | |
| 安全与隔离 | 多租户隔离（基于 World.tenantId） | 已完成 | World 查询均带 tenantId，测试覆盖越权场景。【F:src/repo/worldRepo.ts†L25-L60】【F:src/server/__tests__/read-api.test.ts†L242-L287】 | |
| 安全与隔离 | API Key 撤销机制 | 部分完成 | revokedAt 字段存在但无 API 入口管理。【F:prisma/schema.prisma†L23-L33】 | 需要管理接口 |
| 一致性与并发 | expectedHeadCommitId 乐观锁 | 已完成 | commit/merge 应用中 409 HEAD_CHANGED。【F:src/server/app.ts†L1182-L1242】【F:src/server/app.ts†L1407-L1492】 | |
| 一致性与并发 | 事务性 commit/merge | 已完成 | prisma.$transaction 封装写入链路。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1407-L1484】 | |
| 性能与存储 | 全量快照写入（每次 commit） | 已完成 | commit/merge 写入全量 UnitSnapshot。【F:src/server/app.ts†L1207-L1217】【F:src/server/app.ts†L1432-L1441】 | 未来规模化成本高 |
| 性能与存储 | 游标分页（World/Commit/Unit） | 已完成 | listWorldsPaged、listCommitsByBranchHead、listUnitsPagedByBranch/Commit。【F:src/repo/worldRepo.ts†L34-L47】【F:src/repo/commitRepo.ts†L74-L107】【F:src/repo/unitRepo.ts†L78-L146】 | |
| 性能与存储 | 索引/唯一约束 | 已完成 | tenantId 索引、唯一键、快照索引。【F:prisma/schema.prisma†L20-L96】 | |
| 运维可用性 | OpenAPI 导出脚本 | 已完成 | scripts/export-openapi.ts。【F:scripts/export-openapi.ts†L1-L18】 | |
| 运维可用性 | 运行/迁移指令 | 已完成 | README 快速开始 + prisma scripts。【F:README.md†L15-L67】【F:package.json†L9-L18】 | |
| 运维可用性 | Health Check | 文档写了但实现缺失 | auth 允许 /health，但未见路由实现。【F:src/server/plugins/auth.ts†L24-L35】 | 需补 route |
| 开发者体验 | README 教程 + API demo | 已完成 | README 文档详述流程。【F:README.md†L1-L200】 | |
| 开发者体验 | SDK smoke 脚本 | 已完成 | packages/sdk/scripts/smoke.ts。【F:packages/sdk/scripts/smoke.ts†L1-L25】 | |
| 未来扩展点 | 冲突上下文（unit/refContext/pathTokens） | 已完成 | merge enrich conflict + schema/tests。【F:src/server/app.ts†L1355-L1377】【F:src/server/__tests__/write-api.test.ts†L207-L295】 | 适合 UI |
| 未来扩展点 | Ref 体系仅支持 branch/commit | 部分完成 | parseRef 限定 branch/commit。【F:src/server/ref.ts†L1-L20】 | 后续支持 tag/module |

---

## D. OpenAPI vs 实现差异清单（按严重程度排序）
**高**
1) **`POST /v1/worlds` 返回包含 `tenantId` 的字段可能超出 OpenAPI schema**  
   - 实现：`createWorld` 返回 Prisma World（含 `tenantId`），直接 send。【F:src/server/app.ts†L1014-L1040】【F:src/repo/worldRepo.ts†L4-L22】  
   - OpenAPI schema `worldSchema` 未包含 `tenantId`。【F:src/server/app.ts†L66-L71】  
   - 影响：SDK/客户端严格校验可能失败，契约不一致。

**中**
2) **多个路由的 404 错误码未在 OpenAPI response 中声明**  
   - `GET /v1/worlds/:worldId/commits` 在实现里可能返回 `WORLD_NOT_FOUND`，但 schema 只列出 `BRANCH_NOT_FOUND`。【F:src/server/app.ts†L760-L792】  
   - `GET /v1/worlds/:worldId/commits/:commitId` 实现可能返回 `WORLD_NOT_FOUND`，schema 只列出 `COMMIT_NOT_FOUND`。【F:src/server/app.ts†L815-L848】  
   - `GET /v1/worlds/:worldId/units` 实现可返回 `WORLD_NOT_FOUND` 与 `COMMIT_NOT_FOUND`，schema 只列出 `BRANCH_NOT_FOUND`。【F:src/server/app.ts†L862-L931】  
   - `GET /v1/worlds/:worldId/units/:unitId` 同理，schema 只列 `UNIT_NOT_FOUND`。【F:src/server/app.ts†L951-L1008】  
   - `GET /v1/worlds/:worldId/diff`/`POST /v1/worlds/:worldId/merge` 实现可返回 `WORLD_NOT_FOUND`，schema 只列 `BRANCH_NOT_FOUND`。【F:src/server/app.ts†L1249-L1294】【F:src/server/app.ts†L1298-L1344】

**低**
3) **/health 在 auth 白名单但无路由**  
   - auth 允许 `/health`，但未见路由声明（OpenAPI 亦无）。【F:src/server/plugins/auth.ts†L24-L35】

---

## E. SDK vs OpenAPI/实现差异清单（按严重程度排序）
**高**
1) **SDK 的 `mergePreview` 仅接受 200，实际无冲突时会直接返回 201（apply）**  
   - 实现：无冲突且未传 resolutions 时走 apply 分支并返回 201。【F:src/server/app.ts†L1376-L1484】  
   - SDK：`mergePreview` 强制期待 200，否则抛错。【F:packages/sdk/src/index.ts†L178-L185】

**中**
2) **SDK 未封装 `GET /v1/worlds/:worldId`（world detail）**  
   - 实现存在 world detail 路由。【F:src/server/app.ts†L644-L699】  
   - SDK 仅暴露 listWorlds/listBranches 等方法，无 getWorld。【F:packages/sdk/src/index.ts†L86-L197】

**低**
3) **SDK `mergeApply` 要求 resolutions 数组，无法直接“无冲突 apply”**  
   - 实现允许无冲突直接 apply（无 resolutions）。【F:src/server/app.ts†L1376-L1484】  
   - SDK 方法签名要求 resolutions。【F:packages/sdk/src/index.ts†L186-L193】

---

## F. 数据模型与隔离审计要点（含越权风险、索引建议）
- **多租户隔离基于 World.tenantId**：所有世界查询均带 tenantId，且测试覆盖跨租户访问返回 WORLD_NOT_FOUND。【F:src/repo/worldRepo.ts†L25-L60】【F:src/server/__tests__/read-api.test.ts†L242-L287】  
- **分支/提交/单元表无 tenantId 字段**：隔离依赖于“先查 World 再查 Branch/Commit”，否则新 API 易出现越权存在性泄露风险（例如直接用 commitId 查询）。【F:prisma/schema.prisma†L35-L96】【F:src/repo/commitRepo.ts†L21-L22】【F:src/server/app.ts†L783-L848】  
- **索引/唯一约束**：World.tenantId 索引、ApiKey.keyHash 唯一、UnitSnapshot/UnitState 索引/唯一键齐全。【F:prisma/schema.prisma†L20-L96】  
- **快照不可变性逻辑成立，但无 DB 层冻结约束**：快照只在 commit/merge 创建，未被更新（代码层保证，但 DB 层未硬约束）。【F:src/server/app.ts†L1207-L1217】【F:src/server/app.ts†L1432-L1441】

---

## G. 并发与事务审计要点（含一致性风险）
- **commit / mergeApply 在单事务内完成并带乐观锁**：读 head → 验证 expected → 写 commit/snapshot → 更新 head，失败返回 409 HEAD_CHANGED。【F:src/server/app.ts†L1182-L1242】【F:src/server/app.ts†L1407-L1492】  
- **HEAD_CHANGED 错误码有测试覆盖**（并发 commit 与 merge apply）。【F:src/server/__tests__/write-api.test.ts†L88-L205】  
- **一致性风险**：`listCommitsByBranchHead` 仅按 first parent 线性遍历，merge DAG 的完整历史与族谱可视化未来需要补强。【F:src/repo/commitRepo.ts†L74-L107】

---

## H. 测试质量评估（覆盖范围、假绿风险、建议补的用例）
**现有覆盖**
- 核心算法 diff/merge 的 JSON Pointer 与冲突检测：有单测。【F:src/core/__tests__/diff.test.ts†L1-L55】【F:src/core/__tests__/merge.test.ts†L1-L52】  
- API 集成测试覆盖鉴权、分页、跨租户隔离、并发 HEAD_CHANGED、merge 冲突上下文与路径转义。【F:src/server/__tests__/read-api.test.ts†L56-L287】【F:src/server/__tests__/write-api.test.ts†L56-L383】

**假绿风险**
- **OpenAPI/SDK/实现契约一致性未被测试**（虽有 openapi:check，但没有“路由响应错误码覆盖”的断言）。【F:package.json†L9-L18】【F:.github/workflows/ci.yml†L22-L35】  
- **没有测试 “无冲突 merge 直接 apply” 的行为**（SDK/实现存在潜在分歧）。【F:src/server/app.ts†L1376-L1484】【F:packages/sdk/src/index.ts†L178-L193】  
- **缺少“提交快照不可变”的防回写测试**（例如 snapshot 不随 branch 更新而改变）。【F:src/server/app.ts†L1207-L1217】

**建议补的关键 5 个测试（含 DoD）**
1) **“无冲突 merge 应返回 201”验证 + SDK 行为断言**  
   DoD：在 API 测试中构造无冲突 merge，确认 HTTP 201；在 SDK smoke 或单测中验证 `mergePreview` 抛错/或提供兼容方法。  
   影响：`src/server/__tests__/write-api.test.ts`, `packages/sdk/src/index.ts`。【F:src/server/app.ts†L1376-L1484】【F:packages/sdk/src/index.ts†L178-L193】

2) **跨租户 commitId 直接读取不泄露存在性**  
   DoD：用 tenantB 读取 tenantA 的 commitId，返回 WORLD_NOT_FOUND 或 COMMIT_NOT_FOUND 的一致策略。  
   影响：`src/server/__tests__/read-api.test.ts`, `src/server/app.ts`。【F:src/server/app.ts†L815-L848】【F:src/server/__tests__/read-api.test.ts†L242-L287】

3) **OpenAPI vs 实际错误码校验**  
   DoD：对 `/commits`、`/units`、`/diff`、`/merge` 的 WORLD_NOT_FOUND / BRANCH_NOT_FOUND 错误码进行断言，并同步 OpenAPI。  
   影响：`src/server/app.ts`, `openapi/openapi.json`。【F:src/server/app.ts†L760-L792】【F:src/server/app.ts†L862-L931】

4) **快照不可变性测试**  
   DoD：提交后修改 branch 的 UnitState，确保 commit snapshot 不变。  
   影响：`src/server/__tests__/write-api.test.ts`, `src/repo/unitRepo.ts`。【F:src/server/app.ts†L1207-L1217】【F:src/repo/unitRepo.ts†L36-L52】

5) **DAG 历史遍历差异测试**  
   DoD：merge commit 后，验证 listCommitsByBranchHead 只返回 first parent，并记录为“线性历史”特性。  
   影响：`src/repo/commitRepo.ts`, `src/server/__tests__/read-api.test.ts`。【F:src/repo/commitRepo.ts†L74-L107】

---

## I. Release/契约固化成熟度与缺口（M0/M1/M2）+ 最短升级方案
**当前成熟度：M1（半自动）**  
- 有 CI 检查、OpenAPI/SDK 生成、发布 workflow，但版本更新/打 tag 仍需人工操作。【F:.github/workflows/ci.yml†L1-L35】【F:.github/workflows/publish-sdk.yml†L1-L61】【F:RELEASE.md†L7-L34】

**最短升级到 M2（不超过 3 个改动点）**
1) **引入 release-please 或 changesets** 自动生成版本号/Changelog/Tag。  
2) **在 CI 中验证版本一致性**（root package.json / sdk package.json / app.ts OpenAPI version）。  
3) **发布流程自动化**：合并到 main 即生成 tag + release。  
（参考当前 release 清单与 workflow 结构即可调整。）【F:RELEASE.md†L7-L34】【F:.github/workflows/publish-sdk.yml†L1-L61】

---

## J. 长期愿景差距分析（约束/模组/归因/事件/LLM）+ 推荐扩展点设计
1) **约束规则（世界公理）**  
   - 现状：无 commit 前后校验链，核心 diff/merge 是纯函数。  
   - 建议扩展点：在 commit/merge 事务前引入 `preCommitValidators` / `postCommitValidators` 插件链（返回 warnings/errors），数据结构可挂在 `Commit` 元信息或独立 `ValidationResult`。  
   - 最小路径：在 `src/server/app.ts` commit/merge 事务前插入可选校验器数组，并将结果写入 commit metadata 或返回 warnings。  
   - 证据：commit/merge 事务入口集中于 app.ts，可插入 hook。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1407-L1484】

2) **模块化继承（Lore Modules）**  
   - 现状：Unit 以 `id/type/title/fields` 为核心，未见模块命名空间或来源归因。  
   - 建议扩展点：引入 `moduleId` / `namespace` / `originCommitId`，并在 Unit.refs/meta 扩展依赖。  
   - 最小路径：先在 Unit `meta` 或新增字段中存放 `module` 信息，再扩展 API/SDK。  
   - 证据：Unit schema 已具备 `meta`/`refs` 扩展点。【F:src/core/types.ts†L1-L8】【F:src/server/app.ts†L85-L92】

3) **归因链与贡献度**  
   - 现状：Commit DAG 已存在，但历史遍历线性且未提供归因视图。  
   - 建议扩展点：增强 commit 查询以输出 DAG 关系 + contributor metadata。  
   - 最小路径：新增 `Commit.author` 元数据并提供 `/commits/graph` 或扩展 listCommitsByBranchHead 的 DAG 模式。  
   - 证据：Commit 支持双亲，历史遍历仅 first parent。【F:prisma/schema.prisma†L48-L62】【F:src/repo/commitRepo.ts†L74-L107】

4) **事件订阅/Webhook**  
   - 现状：无事件模型。  
   - 建议扩展点：新增 `Event` 表或直接 webhook 配置表，commit/merge 成功后触发。  
   - 最小路径：在 commit/merge 事务后发送事件（outbox pattern）。  
   - 证据：commit/merge 均集中在 app.ts，可插入事件通知点。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1407-L1484】

5) **LLM 辅助接口**  
   - 现状：无 LLM 入口。  
   - 建议扩展点：新增可选 `/assist/*` 路由 + provider 插件（不影响 deterministic core）。  
   - 最小路径：对 `diff/merge` 输出的 conflicts/changes 生成摘要建议，但不写入 commit。  
   - 证据：diff/merge 输出已结构化，可作为 LLM 输入。【F:src/core/diff.ts†L51-L65】【F:src/core/merge.ts†L94-L120】【F:src/server/app.ts†L1298-L1377】

---

## K. 下一阶段路线图（<=10 项，按优先级）
1) **修复 OpenAPI/实现错误码不一致**  
   - 目的：契约可信度、SDK 生成准确  
   - 影响文件：`src/server/app.ts`, `openapi/openapi.json`  
   - DoD：所有 404 可能值在 OpenAPI 中声明；测试覆盖。  
   - 风险/回滚：低风险，回滚仅需恢复 openapi/json 和 schema。  
   - 证据：多路由 404 不一致。【F:src/server/app.ts†L760-L792】【F:src/server/app.ts†L862-L931】

2) **SDK 合并预览/应用行为统一**  
   - 目的：避免 mergePreview 在无冲突时抛错  
   - 影响文件：`packages/sdk/src/index.ts`, `openapi/openapi.json`  
   - DoD：SDK 提供 `merge` 自动处理 200/201，或区分“previewOnly”参数。  
   - 风险/回滚：中，回滚到旧 SDK 版本即可。  
   - 证据：mergePreview 只接受 200，而服务可返回 201。【F:packages/sdk/src/index.ts†L178-L193】【F:src/server/app.ts†L1376-L1484】

3) **新增 /health 路由**  
   - 目的：运维可用性 + 与 auth 白名单一致  
   - 影响文件：`src/server/app.ts`, `openapi/openapi.json`  
   - DoD：GET /health 返回 200 + 版本信息。  
   - 风险/回滚：低。  
   - 证据：auth 白名单存在 /health，但路由缺失。【F:src/server/plugins/auth.ts†L24-L35】

4) **Commit DAG 访问接口（非线性历史）**  
   - 目的：支撑“分支族谱/归因链”能力  
   - 影响文件：`src/repo/commitRepo.ts`, `src/server/app.ts`, `openapi/openapi.json`  
   - DoD：提供 DAG 查询/分页，返回 parents/children。  
   - 风险/回滚：中，需要新的索引或缓存。  
   - 证据：当前仅 first parent 线性遍历。【F:src/repo/commitRepo.ts†L74-L107】

5) **Commit/Unit 元数据扩展（author/module/origin）**  
   - 目的：为归因链与 Lore Modules 预留结构  
   - 影响文件：`prisma/schema.prisma`, `src/server/app.ts`, `packages/sdk/src/index.ts`  
   - DoD：新增字段 + 迁移 + API/SDK 输出。  
   - 风险/回滚：中，需要迁移回滚策略。  
   - 证据：当前 Unit/Commit 仅基础字段。【F:src/core/types.ts†L1-L32】【F:prisma/schema.prisma†L48-L71】

6) **约束规则（validators）框架**  
   - 目的：形成“世界公理”校验链  
   - 影响文件：`src/server/app.ts`, `src/core/types.ts`  
   - DoD：可注册 validators，返回 warnings/errors 并阻断 commit。  
   - 风险/回滚：中，需兼容旧客户端。  
   - 证据：commit/merge 事务入口集中。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1407-L1484】

7) **事件订阅/Webhook（Outbox）**  
   - 目的：平台化/生态化扩展接口  
   - 影响文件：`prisma/schema.prisma`, `src/server/app.ts`  
   - DoD：commit/merge 后写入 event 并可 webhook 重试。  
   - 风险/回滚：中，需要后台 worker。  
   - 证据：事务结束点明确。【F:src/server/app.ts†L1182-L1233】【F:src/server/app.ts†L1407-L1484】

8) **性能策略（增量快照/指纹）**  
   - 目的：降低快照存储与写入成本  
   - 影响文件：`src/repo/unitRepo.ts`, `src/server/app.ts`, `prisma/schema.prisma`  
   - DoD：引入 blob/patch 存储或去重策略，保留 deterministic diff/merge。  
   - 风险/回滚：高，需要兼容旧快照读取。  
   - 证据：当前每次 commit 写全量快照。【F:src/server/app.ts†L1207-L1217】【F:src/server/app.ts†L1432-L1441】

---

## L. 一键复现命令清单（从 clone 到 migrate/test/openapi export/sdk build/本地运行）
> 这些命令来自 README 与 package scripts（未实际执行）。

1) 安装依赖 & 生成 Prisma：  
```bash
npm install
npm run prisma:generate
```
【F:README.md†L15-L23】【F:package.json†L9-L18】

2) 迁移数据库：  
```bash
npm run prisma:migrate
```
【F:README.md†L56-L61】【F:package.json†L9-L18】

3) 创建 API Key：  
```bash
npm run key:create -- <tenantId> <name>
```
【F:README.md†L31-L36】【F:package.json†L9-L18】

4) 启动服务：  
```bash
WORLDFORK_AUTH=on npm run dev
```
【F:README.md†L65-L67】【F:package.json†L9-L12】

5) 导出 OpenAPI / 校验 / Lint：  
```bash
npm run openapi:export
npm run openapi:check
npm run openapi:lint
```
【F:package.json†L12-L15】

6) 生成 SDK 类型并构建：  
```bash
npm --workspace packages/sdk run gen
npm --workspace packages/sdk run build
```
【F:packages/sdk/package.json†L22-L25】【F:RELEASE.md†L12-L16】

7) 运行测试：  
```bash
npm test
```
【F:package.json†L15-L16】【F:RELEASE.md†L17-L20】

---

## 附录：本次审计执行记录（命令 & 依据）
> 仅列出与结论直接相关的读取命令示例（均为读文件）。

- `sed -n '1,200p' src/server/app.ts`（路由/事务/merge 逻辑核对）。【F:src/server/app.ts†L1-L220】  
- `sed -n '1,200p' prisma/schema.prisma`（数据模型核对）。【F:prisma/schema.prisma†L1-L96】  
- `sed -n '1,200p' packages/sdk/src/index.ts`（SDK 覆盖/签名核对）。【F:packages/sdk/src/index.ts†L1-L197】  
- `sed -n '1,120p' openapi/openapi.json`（OpenAPI 契约核对）。【F:openapi/openapi.json†L1-L120】  
- `sed -n '1,200p' README.md`（文档与代码一致性比对）。【F:README.md†L1-L200】

---

## 加分项执行情况
- 未在本地执行 install/migrate/test/openapi/sdk build（此回复为源码审计结果）。若需要我可按 L 节命令实际运行并补充失败点记录。

---

## Known gaps (from audit)
- OpenAPI 与实现不一致：`POST /v1/worlds` 返回可能包含 `tenantId` 但 schema 未声明。  
- OpenAPI 错误码声明缺失：多个路由可能返回 `WORLD_NOT_FOUND`/`COMMIT_NOT_FOUND`，但 OpenAPI 仅列 `BRANCH_NOT_FOUND`/`UNIT_NOT_FOUND`。  
- SDK `mergePreview` 只接受 200，但服务在无冲突时返回 201。  
- SDK 未封装 `GET /v1/worlds/:worldId`。  
- `/health` 被 auth 白名单允许，但未实现路由与 OpenAPI。

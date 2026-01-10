# WorldFork Core (v0.1)

WorldFork Core 是一个最小闭环原型：建世界 → 写 Unit → 提交 → 分支 → Diff → Merge/冲突 → Merge Commit。

## 设计说明

- **快照存储**：每次提交都会把当前分支的全部 Unit 状态写入 `UnitSnapshot`，保证提交不可变、可重复读取。
- **工作区**：分支维护 `UnitState` 作为当前工作区，提交时从 `UnitState` 生成快照。
- **Diff**：字段级结构对比，输出 JSON Pointer 风格 `path`。
- **Merge**：三方合并（base/ours/theirs）。
  - 若 `ours == base`，采用 `theirs`；若 `theirs == base`，采用 `ours`。
  - 其它情况视为冲突，返回 `conflicts`。
  - 冲突解决只支持 `ours/theirs/manual`，不做语义理解。

## 开始使用

```bash
npm install
npm run prisma:generate
npm run dev
```

默认使用 SQLite（`prisma/dev.db`）。

## API Key 鉴权与多租户

- 默认开启鉴权：`WORLDFORK_AUTH=on`（不设置也默认 on）。
- 关闭鉴权（本地快速调试）：`WORLDFORK_AUTH=off`。
- 鉴权开启时，所有 `/v1/**` 请求必须携带 `X-API-Key`。

创建 API Key（只会显示一次明文）：

```bash
npm run key:create -- <tenantId> <name>
# 或者
node scripts/create-api-key.ts <tenantId> <name>
```

示例输出：

```
tenantId=tenant_demo
apiKey=wf_live_xxx
```

## 快速开始（从拉取到运行）

```bash
# 0) 克隆/进入项目
git clone <your-repo-url>
cd World-Fork-Core

# 1) 安装依赖
npm install

# 2) 生成 Prisma Client
npm run prisma:generate

# 3) 运行数据库迁移
npm run prisma:migrate

# 4) 创建 API Key（鉴权默认开启）
npm run key:create -- tenant_demo "Local Dev Key"

# 5) 启动服务
WORLDFORK_AUTH=on npm run dev
```

默认监听 http://localhost:3000


## API 文档

启动服务后可以查看两种文档：

- **机器可读**：`http://localhost:3000/openapi.json`
- **人可读**：`http://localhost:3000/docs`


## API 演示流程（可直接复制）

> 请先启动服务：`npm run dev`

```bash
# 1) 创建世界
API_KEY=wf_live_xxx
WORLD_ID=$(curl -s -X POST http://localhost:3000/v1/worlds \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"name":"Demo World","description":"v0.1"}' | jq -r '.id')

echo "WORLD_ID=$WORLD_ID"

# 2) main 分支创建 Unit 并提交
UNIT_ID=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","unit":{"type":"npc","title":"Guard","fields":{"hp":10,"role":"watcher"}}}' | jq -r '.id')

echo "UNIT_ID=$UNIT_ID"

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","message":"initial guard"}' | jq

# 3) 从 main 分支创建新分支 alt
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/branches \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"name":"alt","sourceBranch":"main"}' | jq

# 4) alt 修改 unit 并提交
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"alt","unit":{"id":"'"$UNIT_ID"'","type":"npc","title":"Guard (Alt)","fields":{"hp":8,"role":"watcher"}}}' | jq

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"alt","message":"alt tweak"}' | jq

# 5) main 也修改 unit 并提交（制造冲突）
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","unit":{"id":"'"$UNIT_ID"'","type":"npc","title":"Guard (Main)","fields":{"hp":10,"role":"captain"}}}' | jq

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","message":"main tweak"}' | jq

# 6) diff 分支
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/diff?from=branch:main&to=branch:alt" \
  -H "X-API-Key: $API_KEY" | jq

# 7) merge（首次会返回 conflicts + preview）
MERGE_PREVIEW=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/merge \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"oursBranch":"main","theirsBranch":"alt"}')

echo "$MERGE_PREVIEW" | jq

# 8) 解决冲突（示例：title 取 theirs，role 手工指定）
MERGE_COMMIT=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/merge \
  -H "X-API-Key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "oursBranch":"main",
    "theirsBranch":"alt",
    "resolutions":[
      {"unitId":"'"$UNIT_ID"'","path":"/title","choice":"theirs"},
      {"unitId":"'"$UNIT_ID"'","path":"/fields/role","choice":"manual","value":"lieutenant"}
    ]
  }' | jq -r '.mergeCommitId')

echo "MERGE_COMMIT=$MERGE_COMMIT"
```

## 读接口演示（可直接复制）

```bash
# 9) 列世界（分页）
curl -s "http://localhost:3000/v1/worlds?limit=1" -H "X-API-Key: $API_KEY" | jq

NEXT_CURSOR=$(curl -s "http://localhost:3000/v1/worlds?limit=1" -H "X-API-Key: $API_KEY" | jq -r '.nextCursor')
curl -s "http://localhost:3000/v1/worlds?limit=1&cursor=$NEXT_CURSOR" -H "X-API-Key: $API_KEY" | jq

# 10) 列分支
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/branches" -H "X-API-Key: $API_KEY" | jq

# 11) 列 commits（分页）
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/commits?branchName=main&limit=2" -H "X-API-Key: $API_KEY" | jq

COMMIT_CURSOR=$(curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/commits?branchName=main&limit=2" -H "X-API-Key: $API_KEY" | jq -r '.nextCursor')
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/commits?branchName=main&limit=2&cursor=$COMMIT_CURSOR" -H "X-API-Key: $API_KEY" | jq

# 12) 列 units（branch ref + commit ref）
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/units?ref=branch:main&limit=10&includeContent=false" -H "X-API-Key: $API_KEY" | jq

COMMIT_ID=$(curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/commits?branchName=main&limit=1" -H "X-API-Key: $API_KEY" | jq -r '.items[0].id')
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/units?ref=commit:$COMMIT_ID&limit=10&includeContent=true" -H "X-API-Key: $API_KEY" | jq

# 13) 读单个 unit（branch ref + commit ref）
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/units/$UNIT_ID?ref=branch:main" -H "X-API-Key: $API_KEY" | jq
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/units/$UNIT_ID?ref=commit:$COMMIT_ID" -H "X-API-Key: $API_KEY" | jq
```

## 错误格式

所有错误统一返回：

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid request",
    "details": {}
  }
}
```

## SDK（TypeScript）

仓库内提供 `@worldfork/sdk` npm 包（位于 `packages/sdk`），用于类型安全地调用 API。

```ts
import { createClient } from "@worldfork/sdk";

const client = createClient({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.WF_API_KEY
});
```

### 生成 OpenAPI 文件

```bash
npm run openapi:export
```

### 本地生成 SDK 类型与构建

```bash
cd packages/sdk
npm run gen
npm run build
```

### 发布（手动）

```bash
npm publish --access public
```

### 发布（GitHub Actions）

1. 在 GitHub 仓库的 Secrets 中添加 `NPM_TOKEN`。
2. 推送 tag（如 `sdk-v0.1.0`）或手动触发 workflow：`.github/workflows/publish-sdk.yml`。

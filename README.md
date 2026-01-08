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

# 4) 启动服务
npm run dev
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
WORLD_ID=$(curl -s -X POST http://localhost:3000/v1/worlds \
  -H 'content-type: application/json' \
  -d '{"name":"Demo World","description":"v0.1"}' | jq -r '.id')

echo "WORLD_ID=$WORLD_ID"

# 2) main 分支创建 Unit 并提交
UNIT_ID=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","unit":{"type":"npc","title":"Guard","fields":{"hp":10,"role":"watcher"}}}' | jq -r '.id')

echo "UNIT_ID=$UNIT_ID"

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","message":"initial guard"}' | jq

# 3) 从 main 分支创建新分支 alt
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/branches \
  -H 'content-type: application/json' \
  -d '{"name":"alt","sourceBranch":"main"}' | jq

# 4) alt 修改 unit 并提交
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H 'content-type: application/json' \
  -d '{"branchName":"alt","unit":{"id":"'"$UNIT_ID"'","type":"npc","title":"Guard (Alt)","fields":{"hp":8,"role":"watcher"}}}' | jq

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H 'content-type: application/json' \
  -d '{"branchName":"alt","message":"alt tweak"}' | jq

# 5) main 也修改 unit 并提交（制造冲突）
curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/units \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","unit":{"id":"'"$UNIT_ID"'","type":"npc","title":"Guard (Main)","fields":{"hp":10,"role":"captain"}}}' | jq

curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/commits \
  -H 'content-type: application/json' \
  -d '{"branchName":"main","message":"main tweak"}' | jq

# 6) diff 分支
curl -s "http://localhost:3000/v1/worlds/$WORLD_ID/diff?from=branch:main&to=branch:alt" | jq

# 7) merge（首次会返回 conflicts + preview）
MERGE_PREVIEW=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/merge \
  -H 'content-type: application/json' \
  -d '{"oursBranch":"main","theirsBranch":"alt"}')

echo "$MERGE_PREVIEW" | jq

# 8) 解决冲突（示例：title 取 theirs，role 手工指定）
MERGE_COMMIT=$(curl -s -X POST http://localhost:3000/v1/worlds/$WORLD_ID/merge \
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

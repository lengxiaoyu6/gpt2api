# Prompt 分类管理设计

## 目标

为 admin 端 Prompt 库增加独立的分类管理能力，支持新增与删除分类；删除分类时，将关联 Prompt 自动迁移到“通用”；Prompt 编辑与筛选统一改为从分类管理中选择。

## 现状

当前 Prompt 分类仅存在于 `prompt_library_items.category` 字符串字段中。

现有问题：

1. 分类没有独立管理入口。
2. Prompt 编辑表单允许自由输入，分类名称容易分裂。
3. 删除分类没有统一规则。

## 数据设计

新增表 `prompt_library_categories`，字段仅保留：

`id`、`name`、`created_at`、`updated_at`

约束：

1. `name` 唯一，长度上限 80。
2. 预置保留分类“通用”。
3. 删除其它分类时，关联 Prompt 的 `category` 批量迁移到“通用”。
4. “通用”本身不可删除。

兼容策略：

1. `prompt_library_items.category` 继续保留字符串字段，减少现有接口改动。
2. 迁移脚本自动从历史 Prompt 数据中提取去重分类，写入新表。
3. 空分类统一归并为“通用”。

## 后端设计

在 `internal/promptlib` 内扩展两类能力。

### Prompt 分类能力

新增分类实体与输入输出结构。

新增 Store 能力：

1. 查询全部分类。
2. 创建分类。
3. 删除分类并迁移关联 Prompt。
3. 判断分类是否存在。

新增 Service 方法：

1. `ListAdminCategories`
2. `CreateCategory`
3. `DeleteCategory`

删除分类在持久层事务中执行：

1. 查询待删分类。
2. 如果名称为“通用”，返回输入错误。
3. 将 `prompt_library_items.category = 待删分类名` 批量更新为“通用”。
4. 删除分类记录。

### Prompt 保存校验

现有 `Create` 与 `Update` 在完成输入规范化后，增加分类存在性校验。

如果提交分类为空，仍归一为“通用”；随后校验该分类是否存在。不存在则返回 `ErrInvalidInput`。

### 接口设计

新增 admin 路由：

1. `GET /api/admin/prompt-categories`
2. `POST /api/admin/prompt-categories`
3. `DELETE /api/admin/prompt-categories/:id`

现有公开分类接口 `GET /api/public/prompts/categories` 与用户分类接口 `GET /api/me/prompts/categories` 保持原有语义：仅返回启用 Prompt 实际使用到的分类。

## Admin 页面设计

继续使用 `admin/src/views/admin/Prompts.vue` 单页维护。

新增“分类管理”区块，位于筛选区附近，包含：

1. 新增分类输入框与新增按钮。
2. 分类标签列表。
3. 每个可删分类的删除按钮。
4. 删除前弹窗提示“关联 Prompt 将迁移到通用”。

Prompt 编辑弹窗中的“分类”输入框改为 `el-select`，只能从分类列表中选择。

筛选区中的“分类”也改为 `el-select`，来源同一份 admin 分类列表。筛选允许清空表示全部分类。

如果当前筛选值或编辑表单值在分类刷新后失效：

1. 筛选值重置为空。
2. 表单值回退到“通用”。

## 错误处理

1. 分类名称为空、过长、重名时返回 400。
2. 删除“通用”返回 400。
3. Prompt 保存时分类已被删除，返回 400，前端提示后刷新分类。
4. admin 页面首次加载失败时，不阻断 Prompt 列表渲染，但会提示分类相关操作失败。

## 测试设计

### 后端

补充 `internal/promptlib/service_test.go`：

1. 创建分类成功。
2. 分类重名失败。
3. 删除分类会迁移 Prompt 到“通用”。
4. 删除“通用”失败。
5. 保存 Prompt 时分类不存在失败。

补充 `internal/promptlib/migration_test.go`：

1. 新迁移包含分类表创建语句。
2. 插入“通用”。
3. 从历史 Prompt 分类回填分类表。
4. Down 语句存在。

### 前端

补充 `admin/tests/prompt-library.node.test.mjs`：

1. admin 分类管理接口已声明。
2. admin 路由接入分类管理页面元素。
3. Prompt 页面使用 `el-select` 选择分类。
4. 页面包含分类新增、分类删除与迁移提示。

## 影响文件

后端：

`sql/migrations/*prompt_library_categories*.sql`
`internal/promptlib/model.go`
`internal/promptlib/service.go`
`internal/promptlib/dao.go`
`internal/promptlib/handler.go`
`internal/server/router.go`
`internal/promptlib/service_test.go`
`internal/promptlib/migration_test.go`

前端：admin

`admin/src/api/prompt.ts`
`admin/src/views/admin/Prompts.vue`
`admin/tests/prompt-library.node.test.mjs`

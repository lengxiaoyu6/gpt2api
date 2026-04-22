# 历史任务侧边菜单拆分设计

## 背景

当前个人中心的接口文档页位于 `web/src/views/personal/ApiDocs.vue`。页面同时承载三类内容：

1. 接口调用示例与模型选择
2. 文字调用历史
3. 图片任务历史

侧边菜单本身由后端 `internal/rbac/menu.go` 的静态菜单树生成，经 `/api/me/menu` 返回给前端，再由 `web/src/layouts/BasicLayout.vue` 渲染。当前菜单中只有 `接口文档`，还没有 `历史任务` 独立入口。

现有图片任务历史所调用的数据接口为 `/api/me/images/tasks`，该接口在后端挂载于 `self:image` 权限下。与此同时，`/personal/docs` 当前允许 `self:usage` 与 `self:image` 任一权限进入，因此页面职责与数据权限之间存在轻微交叉。

## 目标

本次调整只完成菜单与页面拆分，使图片任务历史从接口文档页中独立出来。

具体目标如下：

1. 在个人中心侧边栏新增 `历史任务` 菜单项。
2. 新菜单进入独立页面，而非接口文档页内部标签。
3. 新页面复用当前已有的图片任务历史展示内容与请求方式。
4. 接口文档页移除图片任务历史区块，保留文档示例、统计信息、文字调用历史、图片生成示例。
5. 权限与页面内容保持一致，`历史任务` 页面仅依赖 `self:image`。

## 本次范围外内容

以下内容保持现状：

1. 图片任务筛选
2. 图片任务详情抽屉
3. 任务重试或再次生成
4. 后端接口字段调整
5. 菜单排序体系重构
6. 自动化测试体系补建

## 现状分析

### 菜单生成方式

后端 `internal/rbac/menu.go` 定义静态菜单树。普通用户区当前包含：

`总览`、`API Keys`、`使用记录`、`账单与充值`、`在线体验`、`接口文档`

前端 `web/src/layouts/BasicLayout.vue` 读取 `useUserStore().menu`，按有无 `children` 渲染一级菜单或分组菜单，因此新增个人中心子菜单时，首选做法是在后端菜单树中增加一项，而不是在前端模板中插入静态菜单。

### 路由现状

前端静态路由位于 `web/src/router/index.ts`。个人中心当前已有：

`/personal/dashboard`
`/personal/keys`
`/personal/usage`
`/personal/billing`
`/personal/play`
`/personal/docs`

因此新增独立菜单时，还需要补充一条新的个人中心子路由，供菜单点击、面包屑与页面标题共同使用。

### 图片任务历史现状

`web/src/views/personal/ApiDocs.vue` 目前内置图片任务历史逻辑，包含以下状态与行为：

1. 通过 `listMyImageTasks` 拉取任务列表
2. 使用 `imagePage.limit` 与 `imagePage.offset` 控制分页增量
3. 使用 `hasMoreImage` 控制“加载更多”按钮显示
4. 以卡片网格形式展示缩略图、提示词、状态、尺寸、时间、积分、错误信息
5. 提供“刷新”按钮重新请求第一页数据

这一整块内容适合迁移至独立页面，保持行为不变。

## 设计选择

### 选择一：前端静态插入菜单

仅在 `BasicLayout.vue` 插入一个静态 `el-menu-item`，并补充路由与页面。

优点是前端改动集中。缺点是菜单来源分散：后端仍维护绝大部分菜单，前端额外维护一项，后续容易产生显示差异，也会削弱 `/api/me/menu` 的统一性。

### 选择二：后端菜单树新增菜单，前端新增独立页面

在 `internal/rbac/menu.go` 增加 `历史任务`，在 `web/src/router/index.ts` 增加独立路由，在 `web/src/views/personal` 新建页面，并把 `ApiDocs.vue` 中现有图片任务历史区块迁移过去。

这一做法与当前架构一致，菜单、路由、页面职责三者清晰对应，也能顺手收拢权限边界。

### 选择三：新增菜单但继续复用接口文档页

新增菜单，指向 `ApiDocs.vue`，通过内部标签或查询参数默认显示历史区域。

改动量较少，但“历史任务”菜单进入后仍看到文档页主体，页面职责依旧混杂，拆分意义有限。

### 采用做法

采用选择二。

## 详细设计

### 菜单设计

文件：`internal/rbac/menu.go`

在个人中心菜单组下新增一项：

- `Key`: `personal.history-tasks`
- `Title`: `历史任务`
- `Icon`: `PictureRounded`
- `Path`: `/personal/history-tasks`
- `Perms`: `PermSelfImage`

放置位置位于 `接口文档` 后方，保持个人中心功能排列的连续性。

### 路由设计

文件：`web/src/router/index.ts`

在 `/personal` 子路由中新增：

- `path`: `history-tasks`
- `component`: `@/views/personal/HistoryTasks.vue`
- `meta.title`: `历史任务`
- `meta.perm`: `self:image`

这样可以复用现有守卫逻辑、页面标题逻辑和顶部面包屑标题映射。

### 页面设计

文件：`web/src/views/personal/HistoryTasks.vue`

页面仅承载当前已有的图片任务历史，不加入新功能。页面结构建议如下：

1. 页头卡片
   - 标题：`历史任务`
   - 简短说明：当前页面展示图片生成任务记录，可刷新或继续加载更多。

2. 任务列表卡片
   - 右上角保留“刷新”按钮
   - 空状态文案沿用现有语义
   - 网格卡片展示沿用现有样式
   - 底部保留“加载更多”按钮

页面内部逻辑直接迁移 `ApiDocs.vue` 中现有图片任务历史相关状态与方法：

- `imageTasks`
- `imagePage`
- `imageLoading`
- `hasMoreImage`
- `loadImageTasks`
- `imageLoadMore`
- `statusTag`

显示字段保持一致：

- 首图缩略图
- 提示词
- 状态
- 尺寸
- `n`
- 创建时间
- 积分消耗
- 错误信息

### 接口文档页调整

文件：`web/src/views/personal/ApiDocs.vue`

需要移除图片任务历史区块与其配套逻辑，只保留接口文档相关内容。预计调整如下：

1. 删除图片任务历史的请求状态与分页状态
2. 删除 `loadImageTasks` 与 `imageLoadMore`
3. 删除模板中“图片任务历史”卡片区块
4. 删除仅为该区块服务的样式，例如图片网格卡片样式
5. 页面说明文字补充一句：图片任务记录可在 `历史任务` 菜单查看

迁移后，`ApiDocs.vue` 的职责集中为：

1. 文本与图片接口示例
2. 14 天汇总统计
3. 文字调用历史
4. 模型选择与代码复制

### 数据与权限设计

本次调整不新增任何后端接口。

数据来源保持：

- `HistoryTasks.vue` 使用 `listMyImageTasks`
- 接口实际地址仍为 `/api/me/images/tasks`
- 接口权限仍为 `self:image`

权限关系调整后更清晰：

- `接口文档` 页面仍允许 `self:usage` 或 `self:image`
- `历史任务` 页面仅允许 `self:image`

这样可以避免文档页在只有文字使用权限时仍主动请求图片任务接口。

## 数据流

### 历史任务页面进入流程

1. 登录后，前端通过 `/api/me/menu` 拉取菜单树。
2. 后端根据角色与权限返回包含 `历史任务` 的个人中心菜单。
3. 侧边栏点击 `历史任务` 后，路由进入 `/personal/history-tasks`。
4. `HistoryTasks.vue` 在挂载时调用 `listMyImageTasks`。
5. 后端根据当前登录态与 `self:image` 权限返回任务列表。
6. 前端按现有卡片样式展示结果。

### 文档页面进入流程

1. 进入 `/personal/docs`。
2. 页面加载模型列表、统计数据、文字历史。
3. 页面不再请求 `/api/me/images/tasks`。

## 异常处理

本次异常处理继续沿用现有页面习惯，不新增统一异常层。

1. 列表请求中，加载态按当前实现显示。
2. 如果图片地址为空，则显示当前页面已有的缩略图区占空样式与任务状态。
3. 如果任务存在错误信息，则在卡片底部显示错误文本。
4. 如果请求失败，则结束加载态并保留当前已展示的数据，本次调整中不新增全局消息提示。

## 兼容性影响

1. 现有 `/personal/docs` 地址保持不变。
2. 侧边栏会新增一项个人中心菜单。
3. 现有图片任务列表展示样式保持不变，只是页面位置发生变化。
4. 未涉及后端接口协议变更，因此外部调用方没有影响。

## 涉及文件

后端：

- `internal/rbac/menu.go`

前端：

- `web/src/router/index.ts`
- `web/src/views/personal/ApiDocs.vue`
- `web/src/views/personal/HistoryTasks.vue`

## 验收标准

1. 登录后，个人中心侧边栏出现 `历史任务` 菜单。
2. 点击菜单可进入 `/personal/history-tasks`。
3. 页面能展示现有图片任务历史，刷新与加载更多行为正常。
4. `接口文档` 页面不再显示图片任务历史。
5. 只有 `self:image` 权限的账户可访问 `历史任务` 页面。
6. 只有 `self:usage` 权限而无 `self:image` 权限的账户进入 `接口文档` 页面时，不再触发图片任务历史请求。

## 实施顺序

1. 补充后端菜单树中的 `历史任务` 节点。
2. 补充前端个人中心路由。
3. 新建 `HistoryTasks.vue`，迁移现有图片任务历史展示逻辑。
4. 清理 `ApiDocs.vue` 中已迁移部分。
5. 执行前端构建检查，确认类型与打包通过。

# WAP 端后端接入设计文档

## 目标

将 `wap` 目录下当前依赖本地假数据与 Gemini SDK 的移动端页面，调整为接入现有后端 API 的真实业务页面。

本次工作范围限定在 `wap` 目录内，重点是认证、用户信息、每日签到、图片生成、历史任务的后端接入与状态同步。界面视觉样式保持现状，仅调整数据来源、交互逻辑与异常处理。

## 约束

1. 仅修改 `wap` 目录内代码与相关构建配置。
2. 可以参考 `web` 端已有接口封装与字段约定。
3. 禁止修改 `wap` 端既有视觉风格，只允许在原有结构内替换字段、绑定行为与数据流。
4. 图片模型选择采用自动方式，不新增模型选择控件。
5. “极致优化”能力整体移除，包括生成页逻辑与首页能力文案。

## 接入范围

本次接入覆盖以下能力：

1. 登录与注册。
2. 当前用户信息读取与积分展示。
3. 每日签到状态读取与签到提交。
4. 文生图与图生图。
5. 历史图片任务读取。
6. 应用启动时的站点公开信息读取与登录态恢复。

以下内容保持现状或明确排除：

1. 不新增支付、会员、帮助反馈等后端页面能力。
2. 不新增图片模型手动切换界面。
3. 不调整底部导航、卡片、按钮、输入框等视觉样式。
4. 不处理 `wap` 范围之外的 `web` 或后端展示层重构。

## 现状

`wap` 当前主要问题集中在数据源与状态管理：

1. `wap/src/store/useStore.ts` 使用 `zustand persist` 维护本地伪登录、本地积分与本地历史记录。
2. `wap/src/lib/gemini.ts` 直接调用 Gemini SDK，与现有后端能力割裂。
3. `AuthOverlay` 登录态只有“用户名 + 邮箱”，与后端 `email + password` 登录协议不一致。
4. `Generate` 页的积分扣减、历史追加与结果产出均是前端本地模拟。
5. `History` 与 `Profile` 页面展示的数据不来自服务端。
6. `wap/vite.config.ts` 尚未补齐对后端接口与图片代理地址的开发代理。

## 后端接口对照

本次接入使用的后端接口如下：

### 公开接口

`GET /api/public/site-info`

用于读取站点公开配置，至少关注：

1. `site.name`
2. `site.description`
3. `site.logo_url`
4. `site.footer`
5. `auth.allow_register`

### 认证接口

`POST /api/auth/register`

请求字段：

```json
{
  "email": "",
  "password": "",
  "nickname": ""
}
```

`POST /api/auth/login`

请求字段：

```json
{
  "email": "",
  "password": ""
}
```

登录成功后返回 `user` 与 `token`，其中 token 按 `web` 端约定写入以下本地键：

```ts
gpt2api.access
gpt2api.refresh
```

### 当前用户与签到

1. `GET /api/me`
2. `GET /api/me/checkin`
3. `POST /api/me/checkin`

其中用户积分以 `user.credit_balance` 为准。

### 模型与图片任务

1. `GET /api/me/models`
2. `GET /api/me/images/tasks`
3. `GET /api/me/images/tasks/:id`
4. `POST /api/me/playground/image`
5. `POST /api/me/playground/image-edit`

`/api/me/models` 返回模型列表后，仅保留 `type === "image"` 的模型。默认取首个可用项或已缓存且仍存在的已选模型。

## 方案比较

### 方案一

保留现有 `useStore` 结构，只把本地方法替换成接口调用。

优点是修改面小，接入速度快。缺点是本地伪状态命名与真实后端字段差异较大，例如 `points`、`history`、`username` 等字段会持续做映射，后续维护成本偏高。

### 方案二

新增轻量 API 层，并将 `useStore` 调整为真实业务状态协调层，由 store 统一负责启动恢复、认证串联、页面数据刷新与异常清理。

优点是职责边界清晰，组件改动集中在事件绑定与字段读取；后续继续接入更多个人中心接口时可复用。代价是需要一次性调整 store 结构与异步动作。

### 方案三

将 `wap` 页面分别拆成多个局部 store，由页面各自维护接口请求与本地状态。

优点是页面隔离较强。缺点是登录态、用户积分、签到状态、历史任务刷新会跨多个页面重复实现，启动恢复与 `401` 清理也会分散。

当前采用方案二。原因是本次需求集中在“统一接入已有后端”，跨页面共享状态较多，适合由 store 统一协调。

## 总体设计

`wap` 新增一层与 `web` 对齐的 API 封装，由 API 层负责请求与响应解包，由 `zustand` store 负责状态恢复、接口串联与跨页面同步，组件层继续保持当前布局与样式，只替换数据读取与事件处理。

整体分为三层：

1. API 层：请求后端，处理 token 注入、响应解包与鉴权失败清理。
2. Store 层：维护用户、签到、模型、历史、认证弹层与待跳转页面等全局状态。
3. 组件层：保留原样式，仅绑定真实字段与真实提交动作。

## 文件划分

### API 层

新增以下文件：

`wap/src/api/http.ts`
统一处理 `baseURL`、`Authorization`、响应解包、`401` 清理。

`wap/src/api/auth.ts`
封装 `register`、`login`。

`wap/src/api/site.ts`
封装 `GET /api/public/site-info`。

`wap/src/api/me.ts`
封装 `getMe`、`getCheckinStatus`、`checkinToday`、`listMyModels`、`listMyImageTasks`、`playGenerateImage`、`playEditImage`。

### Store 层

`wap/src/store/useStore.ts` 改为真实后端状态协调层，建议包含以下字段：

```ts
siteInfo
bootstrapStatus
user
checkin
imageModels
selectedImageModel
history
pendingTab
authOverlayOpen
```

建议包含以下动作：

```ts
bootstrapApp
login
register
logout
fetchMe
fetchCheckin
fetchImageModels
fetchHistory
submitCheckin
generateImage
editImage
openAuthForTab
closeAuth
```

### 组件层

保持现有文件结构，仅替换交互逻辑：

1. `wap/src/App.tsx`
2. `wap/src/components/AuthOverlay.tsx`
3. `wap/src/components/views/Generate.tsx`
4. `wap/src/components/views/History.tsx`
5. `wap/src/components/views/Profile.tsx`
6. `wap/src/components/views/Home.tsx`

## 数据装载顺序

1. 应用启动时，`App.tsx` 调用 `bootstrapApp()`。
2. `bootstrapApp()` 首先请求 `GET /api/public/site-info`，并读取本地 `access`、`refresh` token。
3. 本地没有 `access token` 时，启动阶段在站点信息完成后结束，首页继续可浏览，受保护页面由认证层拦截。
4. 本地存在 `access token` 时，启动阶段继续请求 `GET /api/me`，成功后写入用户资料与积分。
5. `GET /api/me` 成功后，并发请求 `GET /api/me/checkin` 与 `GET /api/me/models`。
6. 历史任务采用按需加载，首次进入“记录”页时请求 `GET /api/me/images/tasks?limit=20&offset=0`。
7. 生图成功后再次刷新 `GET /api/me` 与历史任务第一页。

这种顺序可以保证首页与认证页尽快显示，同时避免将历史任务请求放在首屏启动链路内。

## 页面状态同步

### 启动与标签切换

`App.tsx` 增加 `pendingTab` 逻辑。匿名状态点击“生成”“记录”“我的”时，先记录目标标签，再打开认证层；登录或注册成功后，自动跳转到此前目标页。

### 登录与注册

`AuthOverlay` 登录态改为“邮箱 + 密码”，注册态改为“昵称 + 邮箱 + 密码”。视觉结构、卡片样式、输入框样式、按钮样式保持现状。

注册入口由 `siteInfo['auth.allow_register']` 控制。站点关闭注册时：

1. 不展示切换到注册态的入口。
2. 如果当前正停留在注册态，则自动切回登录态。
3. 注册提交动作不可触发。

登录成功后的串联顺序为：

1. 保存 token。
2. 写入基础用户信息。
3. 调用 `GET /api/me` 统一用户结构。
4. 并发刷新签到状态与模型列表。
5. 关闭认证层并跳转 `pendingTab`。

注册成功后的串联顺序为：

1. 调用 `POST /api/auth/register`。
2. 紧接调用 `POST /api/auth/login` 获取 token。
3. 后续流程与登录完全一致。

原因是注册接口只返回用户信息，不返回 token。

### 用户与签到

个人页积分展示以后端 `credit_balance` 为准。签到按钮状态由 `GET /api/me/checkin` 返回值控制：

1. `enabled = false` 时，按钮禁用并显示关闭态文案。
2. `enabled = true` 且 `checked_in = false` 时，允许签到。
3. `checked_in = true` 时，展示今日已领取状态。

签到成功后刷新：

1. `GET /api/me`
2. `GET /api/me/checkin`

### 图片模型

模型列表通过 `GET /api/me/models` 拉取，仅保留 `type === "image"` 的项。界面上不新增模型选择控件，生成页内部总是使用当前默认模型。

默认模型选择顺序如下：

1. 已缓存且仍存在于模型列表中的 `selectedImageModel`。
2. 模型列表首个可用项。
3. 空值。

### 历史任务

历史页数据源改为 `history.items`。搜索仍在前端基于已拉取的第一页结果执行。历史详情弹层优先显示接口真实字段，如 `prompt`、`created_at`、`size`、`status`、`image_urls`；接口未返回的数据继续留空或使用固定说明文案，避免伪造模型名或耗时。

## 图片生成设计

### 文生图

`Generate` 页文生图模式调用：

`POST /api/me/playground/image`

请求体包含：

```json
{
  "model": "<selected image model>",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024"
}
```

### 图生图

图生图优先调用：

`POST /api/me/playground/image-edit`

前端上传区同时保存两份状态：

1. 页面预览用的本地 URL 或 data URL。
2. 真正提交用的 `File` 对象。

这样可以保持现有预览样式，同时满足 `multipart/form-data` 上传要求。

### 比例映射

界面比例值映射为后端 `size`：

```ts
'1:1'   -> '1024x1024'
'4:3'   -> '1536x1152'
'3:4'   -> '1152x1536'
'16:9'  -> '1792x1024'
'9:16'  -> '1024x1792'
```

其中 `1:1`、`4:3`、`16:9`、`9:16` 已在 `web/src/views/personal/OnlinePlay.vue` 使用；`3:4 -> 1152x1536` 作为与 `4:3` 对应的竖版尺寸，在 `internal/gateway/images.go` 中会原样透传给上游。

### 生成成功后的同步

无论文生图还是图生图，生成成功后统一执行：

1. 更新当前结果图显示。
2. 刷新 `GET /api/me`。
3. 刷新历史任务第一页。

如果服务端返回 `is_preview = true`，页面仍视为成功，但给出“预览模式”提示。

## 组件调整方案

### `wap/src/components/AuthOverlay.tsx`

仅调整字段与逻辑：

1. 登录态为邮箱与密码。
2. 注册态为昵称、邮箱、密码。
3. 提交动作改为调用 store 的 `login` 与 `register`。
4. 注册开关由 `site-info` 控制。

### `wap/src/components/views/Generate.tsx`

保留布局与样式，调整以下行为：

1. 移除 `gemini.ts` 依赖。
2. 移除“极致优化”按钮、状态与提示文案。
3. 比例值改为映射到后端 `size`。
4. 文生图调用 store 的 `generateImage`。
5. 图生图调用 store 的 `editImage`。
6. 结果图展示继续保留。
7. 上传区同时维护 `File` 与预览 URL。

### `wap/src/components/views/History.tsx`

保留搜索框、图片网格、详情弹层样式；数据源改为 store 中真实历史任务列表。

### `wap/src/components/views/Profile.tsx`

保留现有个人卡片与菜单样式，积分与签到按钮切换为后端真实状态。

### `wap/src/components/views/Home.tsx`

移除“极致优化”能力卡，仅保留“文生图”“图生图”两项；只调整数据项与文案，不改卡片视觉样式。

## 异常处理

### 鉴权失败

统一在 `http.ts` 中处理 `401`：

1. 清除 `gpt2api.access` 与 `gpt2api.refresh`。
2. 清空 store 中的 `user`、`checkin`、`history`、`selectedImageModel`。
3. 当前页面如果位于受保护标签，则切回首页。
4. 自动重新打开认证层。

### 权限或功能关闭

1. 注册接口返回 `user registration is currently disabled` 时，刷新一次 `site-info`，并切回登录态。
2. 签到接口返回 `daily checkin disabled` 时，将签到状态写为关闭态。
3. 模型为空时，生成按钮禁用，并保留提示词与参考图内容。
4. 图片接口返回模型权限不足、账号封禁等错误时，保留服务端原始错误信息。

### 网络失败与上传失败

提交失败时保留当前输入状态：

1. 提示词不清空。
2. 已上传图片不清空。
3. 结果图区维持此前最后一次成功结果或空状态。

### 图生图调用策略

图生图优先走 `/api/me/playground/image-edit`。本次实现不追加自动回退到 `/api/me/playground/image` 的二次提交逻辑，避免失败时产生重复任务与重复计费。

## 开发代理

`wap/vite.config.ts` 需要补齐开发代理，至少覆盖：

```ts
/api
/v1
^/p/
/healthz
```

这样开发环境下的接口请求、图片代理地址与健康检查都可以透传到当前后端服务。

## 旧逻辑清理

以下逻辑在接入完成后应停止使用：

1. `wap/src/lib/gemini.ts` 的业务调用。
2. `useStore` 中的本地伪登录。
3. `useStore` 中的本地积分增减逻辑。
4. `useStore` 中的本地历史追加逻辑。
5. `Generate` 页中的“极致优化”逻辑。
6. `Home` 页中的“极致优化”能力入口。

## 测试与验证

本次实现按先补测试再改实现的顺序推进，至少覆盖以下边界：

### API 层

1. token 注入。
2. `401` 清理。
3. `site-info` 中注册开关解析。
4. 模型筛选与默认模型选择。
5. 文生图与图生图请求参数组装。

### Store 层

1. 启动恢复登录态。
2. 登录与注册后的串联请求。
3. 生图成功后的 `me + history` 刷新。
4. 登出与 `401` 的状态清空。
5. 签到成功后的用户信息刷新。

### 组件层

1. `AuthOverlay` 登录注册字段切换。
2. 匿名状态进入受保护页面时弹出认证层。
3. 注册关闭时隐藏注册入口。
4. 生成页在模型为空、提示词为空、参考图为空时的按钮状态。
5. 个人页签到按钮的已签到、可签到、已关闭三种状态。

### 构建校验

至少执行以下命令：

1. `npm run lint`
2. `npm run build`
3. 新增测试命令

## 实施边界

本次工作完成的标志如下：

1. `wap` 页面已接入真实后端接口。
2. 登录、注册、签到、文生图、图生图、历史记录可以在移动端真实运行。
3. `wap` 视觉样式保持既有结构。
4. “极致优化”能力已从页面与逻辑中移除。
5. 开发环境可通过代理访问后端 API 与历史图片地址。

以下内容不属于本次完成标志：

1. 会员、充值、帮助反馈页面的真实接入。
2. 图片模型切换控件。
3. 历史任务分页滚动加载。
4. `wap` 首页整体改版。

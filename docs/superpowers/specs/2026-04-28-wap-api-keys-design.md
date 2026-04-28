# WAP 端 API Keys 管理设计

## 目标

在 WAP 端个人中心补齐 API Keys 管理能力，覆盖列表查看、新建、启用与禁用、删除、明文 Key 单次展示，并与现有后端 `/api/keys` 能力对齐。

## 现状

后端已经提供普通用户侧 API Keys 接口：

`POST /api/keys`
`GET /api/keys`
`PATCH /api/keys/:id`
`DELETE /api/keys/:id`

桌面端已经有完整字段与交互参考，WAP 端当前仅有个人中心、积分记录、安全中心等功能，尚无 API Keys 页面与 API 封装。

## 方案选择

采用个人中心内嵌二级页面方案。

原因有三点：

第一，`Profile.tsx` 已经存在 `activeSection` 切换机制，`ProfileCreditLogs` 已验证这种交互适合 WAP 端。

第二，API Keys 同时包含列表、创建表单、状态切换、删除确认、明文 Key 展示，弹层或侧滑面板会让层级过深，卡片式子页面更稳定。

第三，保留在“我的”页内部，能够沿用现有页头、返回、版权、动画与视觉风格。

## 信息架构

个人中心新增菜单项：`API Keys`。

点击后切换到新的子页面 `ProfileApiKeys`。

页面结构分为四部分：

1. 顶部返回栏与标题说明
2. 列表区域
3. 创建按钮与创建弹窗
4. 明文 Key 单次展示弹窗

删除确认采用单独确认弹窗，避免直接误删。

## 组件拆分

新增 `wap/src/api/apikey.ts`

职责：

封装 `listKeys`、`createKey`、`updateKey`、`deleteKey`。

字段与桌面端 `web/src/api/apikey.ts` 保持一致，编码风格遵循 WAP 端现有 API 模块。

新增 `wap/src/components/views/ProfileApiKeys.tsx`

职责：

1. 首屏加载列表
2. 展示列表卡片
3. 处理创建弹窗
4. 处理状态切换
5. 处理删除确认
6. 处理明文 Key 单次展示
7. 支持加载更多

修改 `wap/src/components/views/Profile.tsx`

职责：

1. 扩展 `activeSection`
2. 在菜单区新增 API Keys 入口
3. 在子页面分支中挂载 `ProfileApiKeys`

## 交互设计

### 列表展示

列表采用卡片式布局，每张卡片展示：

名称
前缀
状态
额度使用情况
RPM 与 TPM
允许模型
IP 白名单
最近使用时间与 IP
创建时间

状态通过徽标区分启用与禁用。

额度规则如下：

如果 `quota_limit > 0`，显示 `quota_used / quota_limit`。

如果 `quota_limit <= 0`，显示“无限”。

空白名单显示“全部”或“不限”，与字段语义保持一致。

### 分页

采用“加载更多”方式。

初始请求 `page=1&page_size=20`。如果当前累计条目少于总数，则显示“加载更多”按钮；加载新页时追加到当前列表。

### 新建 Key

创建弹窗提供完整字段：

名称
额度
RPM
TPM
允许模型
IP 白名单

允许模型与 IP 白名单使用逗号分隔字符串输入，提交前拆分为字符串数组，并过滤空项。

名称为空时阻止提交。

### 明文 Key 单次展示

创建成功后立即关闭创建弹窗，打开“请保存 Key”弹窗。

弹窗内容包含：

完整明文 Key
复制按钮
警示文案“仅展示一次”
确认按钮“已保存”

关闭后仅保留列表中的前缀信息。

### 启用与禁用

卡片上提供“启用”或“禁用”按钮。

触发后调用 `PATCH /api/keys/:id`，请求体仅提交 `enabled` 字段。成功后刷新当前列表。

### 删除

删除操作先打开确认弹窗，确认后调用 `DELETE /api/keys/:id`。

删除成功后重新加载当前页；如果当前页删除后为空且当前页大于 1，则回退上一页重新加载。

## 数据流

### 初始化

进入 API Keys 子页面后加载第一页数据，并记录：

当前页码
每页大小
总数
列表数据
加载状态

### 创建

提交表单 → 接口成功 → 关闭创建弹窗 → 刷新第一页 → 展示明文 Key 弹窗。

### 启用与禁用

点击按钮 → 更新接口 → 刷新当前列表。

### 删除

点击删除 → 打开确认弹窗 → 确认后删除 → 刷新当前页，必要时回退页码。

## 异常处理

统一使用 `toast.error` 展示接口错误。

重点覆盖：

名称为空
创建失败
列表加载失败
状态更新失败
删除失败
复制失败

空列表显示空态卡片“还没有 API Key”。

## 测试范围

### 入口与导航

验证个人中心存在 API Keys 菜单项。

验证点击后进入 API Keys 页面，并可返回个人中心。

### 列表

验证列表字段正确渲染。

验证空列表状态。

验证加载更多行为。

### 新建

验证完整字段提交结构。

验证创建成功后展示明文 Key。

验证复制行为。

### 更新与删除

验证启用与禁用请求。

验证删除确认弹窗与删除成功后的刷新。

## 影响文件

新增：

`wap/src/api/apikey.ts`
`wap/src/components/views/ProfileApiKeys.tsx`

修改：

`wap/src/components/views/Profile.tsx`
`wap/src/components/backend-binding.test.tsx`
`wap/src/components/app.integration.test.tsx`

必要时补充 `wap/src/components` 相关测试辅助逻辑。

# WAP 首页底部版权与站点名称一致设计文档

## 目标

将 `wap` 首页底部版权中的写死品牌文案改为站点公开配置中的 `site.name`，使首页底部版权与页面标题来源保持一致。

## 范围

本次只修改 `wap` 目录内首页底部版权相关逻辑与测试，不调整任何样式结构。

## 现状

当前 `wap/src/App.tsx` 已经从 `siteInfo['site.name']` 读取站点名称，并用于头部品牌显示。

当前 `wap/src/components/views/Home.tsx` 底部版权仍然写死为：

```tsx
GPT2API • Creative Studio
Powered by GPT2API Image Playground
```

因此站点名称与首页底部版权来源不一致。

## 方案

继续以 `App.tsx` 作为站点名称读取入口：

```tsx
const siteName = siteInfo['site.name'] || 'GPT2API'
```

再将 `siteName` 作为属性传入 `HomeView`。`HomeView` 仅负责展示，不自行读取全局 store。

底部版权区域保持原有两行结构与样式类名，只替换文案内容：

1. 第一行显示 `siteName`
2. 第二行显示 `© {siteName}`

这样既保留“版权”语义，也确保底部展示名称与页面标题来源一致。

## 文件影响范围

### 修改文件

`wap/src/App.tsx`

将 `siteName` 传给 `HomeView`。

`wap/src/components/views/Home.tsx`

新增 `siteName` 属性，并将底部版权文案改为基于 `siteName` 渲染。

### 测试文件

`wap/src/components/app.integration.test.tsx`

新增首页回归断言，验证：

1. 自定义 `site.name` 时，首页头部与底部都显示该名称
2. 旧的 `GPT2API` 底部版权写死文案已移除

## 测试策略

按先测试后实现的顺序进行。

### 组件回归测试

新增一条 `App` 级别集成测试，设置：

```tsx
siteInfo: {
  'site.name': '星河图像',
  'site.description': 'AI 创作平台',
  'site.logo_url': '',
  'site.footer': '',
  'auth.allow_register': 'true',
}
```

验证：

1. `screen.getAllByText('星河图像')` 长度为 `2`
2. `screen.getByText('© 星河图像')` 存在
3. `screen.queryByText('GPT2API • Creative Studio')` 为 `null`

### 完整校验

执行以下命令：

```bash
cd wap && npm run test -- --run src/components/app.integration.test.tsx
cd wap && npm run test -- --run
cd wap && npm run lint
cd wap && npm run build
```

## 完成标志

满足以下条件即可认为本次调整完成：

1. 首页底部版权名称与 `site.name` 一致
2. `HomeView` 不再包含写死的 `GPT2API` 底部品牌文案
3. 页面样式结构保持不变
4. 测试、类型检查与构建通过

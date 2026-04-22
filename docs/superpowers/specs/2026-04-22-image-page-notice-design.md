# 生图页面公告设计

## 目标

为生图页面增加一条后台可配置的公告文案，数据存储在 `system_settings`，通过现有系统设置页维护，并同时在 Web 与移动端生图页展示。

## 设计

公告配置采用现有系统设置白名单体系，在 `internal/settings/model.go` 中新增公开字符串键 `site.image_notice`。

该键进入 `Defs` 后，`GET /api/admin/settings` 会自动出现在后台系统设置页，`GET /api/public/site-info` 会自动向匿名端返回，前后端无须新增独立接口或独立数据表。

后台配置继续使用现有 `web/src/views/admin/Settings.vue`。由于公告文案可能长于普通单行字段，该页对 `site.image_notice` 使用多行输入框渲染，其余字符串字段保持原状。

Web 端在 `web/src/views/personal/OnlinePlay.vue` 读取 `useSiteStore()` 中的公开站点信息，在页面顶部展示公告；空字符串时隐藏。

移动端在 `wap/src/components/views/Generate.tsx` 读取 `useStore()` 中的 `siteInfo`，在页面顶部展示同一条公告；空字符串时隐藏。

## 展示规则

公告内容为单文本，不支持富文本。

公告展示位置位于生图页头部信息区之前或紧邻其下方，保证在桌面端与移动端首屏可见，同时避免压缩主要操作区。

公告关闭方式采用“配置为空即隐藏”，当前阶段不增加单独启停开关。

## 测试范围

后端测试验证新增设置键会出现在 `PublicSnapshot()` 中。

Web 静态测试验证：

1. 设置模型声明了 `site.image_notice` 且标记为公开。
2. 后台系统设置页对该键使用 `textarea`。
3. Web 生图页读取并渲染公告。

移动端测试验证 `GenerateView` 在 `siteInfo['site.image_notice']` 存在时会展示公告文案。

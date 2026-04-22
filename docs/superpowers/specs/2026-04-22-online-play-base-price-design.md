# 在线体验图片基准价格展示设计文档

## 目标

在个人中心的在线体验页中，为图片模型展示单张基准价格，使开发者与零散客户在调用前即可知道该模型的基础计费口径。

本次展示口径固定为模型配置中的 `image_price_per_call`，单位仍沿用现有积分展示规则，页面文案使用“单张基准价格”。

## 范围

改动限制在以下三处：

1. `GET /api/me/models` 返回图片模型的 `image_price_per_call` 字段。
2. `web/src/api/me.ts` 中的 `SimpleModel` 同步该字段类型。
3. `web/src/views/personal/OnlinePlay.vue` 在图片模型选择区域展示单张基准价格与累计扣费提示。

数据库表结构、模型 DAO、管理员模型接口与其它页面均维持现状。

## 数据来源

后端现有模型实体 `internal/model/model.go` 已包含 `ImagePricePerCall` 字段，`internal/model/dao.go` 的 `ListEnabled()` 通过 `SELECT *` 返回完整模型数据，因此普通用户接口只需放宽返回字段即可。

前端价格展示继续复用 `formatCredit()`，保持与管理端价目显示一致。

## 页面行为

在线体验页在图片模型选中后展示两条信息：

1. `单张基准价格：XX 积分 / 张`
2. `多张生成会按张数累计扣费`

价格区域应跟随当前选中的图片模型变化。未选中图片模型时按 `0` 展示，避免出现空白占位。

文生图与图生图均使用同一图片模型选择状态，因此两个图片入口都展示相同价格提示，保证信息一致。

## 测试与验证

本次采用现有 `node:test` 静态源码断言模式，覆盖以下内容：

1. `internal/model/admin_handler.go` 的普通用户模型返回结构包含 `image_price_per_call`。
2. `web/src/api/me.ts` 的 `SimpleModel` 包含 `image_price_per_call`。
3. `web/src/views/personal/OnlinePlay.vue` 包含“单张基准价格”“多张生成会按张数累计扣费”等价格提示文案与字段引用。
4. 前端构建通过，确保类型声明与模板引用完整。

# 弹窗公告设计

## 目标

新增多条公告维护能力。管理员在后台维护公告，Web 个人中心与 WAP 首页读取启用公告。首条未读公告以弹窗展示，关闭后写入浏览器本地缓存，后续访问停止自动弹出；用户仍可通过公告入口查看启用公告列表。

## 设计

公告采用独立数据表 `announcements`，避免把结构化列表写入 `system_settings`。公告字段包含 `id`、`title`、`content`、`enabled`、`sort_order`、`created_at`、`updated_at`。公告正文按纯文本处理，前端使用文本渲染，避免 HTML 注入。

后端新增 `internal/announcement` 包，包含模型、DAO、服务和 HTTP handler。后台接口挂载到 `/api/admin/announcements`，权限复用 `system:setting`。公开接口挂载到 `/api/public/announcements`，只返回启用公告，并按 `sort_order DESC, id DESC` 排序。

Web 管理端新增公告管理页，支持列表、新增、修改、删除、启用状态、排序维护。菜单放在后台管理区，路由为 `/admin/announcements`。

Web 个人中心在 `BasicLayout` 中挂载公告弹窗组件，使个人中心各页面均可触发。组件调用公开公告接口，读取 `localStorage` 中的已读 ID 集合，找到首条未读公告后弹窗展示。点击“知道了”写入已读缓存。顶部提供“公告”入口，可查看全部启用公告。

WAP 首页在 `App.tsx` 中读取公开公告接口，只有当前标签为首页时触发弹窗。首页头部提供“公告”入口，打开公告列表。已读状态同样使用 `localStorage` 按公告 ID 保存。

## 缓存规则

本地缓存 key 统一使用：

```text
gpt2api.announcement.read.ids
```

缓存值为 JSON 数组，元素为公告 ID。缓存解析失败时按空数组处理。删除公告后，旧 ID 留在本地缓存中，不影响后续公告展示。

## 接口

后台接口：

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/announcements` | 获取全部公告 |
| `POST` | `/api/admin/announcements` | 创建公告 |
| `PUT` | `/api/admin/announcements/:id` | 修改公告 |
| `DELETE` | `/api/admin/announcements/:id` | 删除公告 |

公开接口：

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| `GET` | `/api/public/announcements` | 获取启用公告 |

## 校验

标题和正文保存前去除首尾空白。标题长度限制为 1 到 120 字符，正文长度限制为 1 到 5000 字符。排序值限制在合理整数范围内，由前端输入组件和后端服务共同限制。

## 测试范围

后端测试覆盖服务层校验、公开列表只返回启用公告、排序规则、创建和修改会规范化输入。静态测试覆盖路由、菜单、前端 API 封装、Web 个人中心弹窗组件挂载、WAP 首页公告入口与弹窗逻辑。

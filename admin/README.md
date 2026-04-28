# GPT2API 管理后台前端

基于 Vue 3 + TypeScript + Vite + Element Plus 的管理端前端，面向管理员提供统一后台入口。

管理端负责账号池、代理池、模型、充值订单、用量统计、公告、系统设置等后台能力。用户注册、创作、历史记录、个人资料、API Key 与充值入口由用户端工程承接。

## 快速开始

```bash
cd admin
npm install
npm run dev
```

开发服务器通过 Vite 代理 `/api`、`/v1`、`/healthz` 到后端，默认后端地址为 `http://localhost:8080`。需要调整后端地址时，修改 `.env.development` 中的 `VITE_API_BASE`。

## 生产构建

```bash
npm run build
npm run preview
```

生产构建产物位于 `admin/dist/`。Docker 镜像会将该目录复制到 `/app/admin/dist`，Go 服务根据访问域名返回管理端页面。

## 目录约定

```text
src/
  api/         后端 HTTP 客户端封装
  router/      路由表与权限守卫
  stores/      Pinia 状态管理
  layouts/     后台布局与空白布局
  views/
    auth/      管理员登录
    admin/     管理员页面
  utils/       金额、字节、时间格式化
  styles/      全局样式
  components/  公共组件
```

## 权限模型

登录后通过 `GET /api/me` 获取用户、角色与权限，通过 `GET /api/me/menu` 获取菜单树。登录页提交后会校验管理员身份，只有 `role=admin` 的账号进入后台。

路由级权限使用 `route.meta.perm` 声明，守卫调用 `store.hasPerm()` 进行前置校验。按钮等界面元素也会参考同一权限判断。真正的权限校验由后端 `middleware.RequirePerm` 执行。

## 敏感操作二次确认

下列操作会要求在浏览器中再次输入管理员密码，并通过 `X-Admin-Confirm` 头发送：

```text
POST   /api/admin/users/:id/reset-password
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/credits/adjust
/api/admin/system/backup/*
```

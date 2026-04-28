# GPT2API Web 用户端前端

基于 React + TypeScript + Vite 的用户端前端，提供注册登录、生图、历史记录、个人资料、API Key、积分账单与充值等用户侧功能。

## 快速开始

```bash
cd web
npm install
npm run dev
```

开发服务器通过 Vite 代理 `/api` 与 `/p/` 到后端，默认后端地址为 `http://localhost:8080`。需要调整后端地址时，修改 `.env.example` 或本地环境文件中的 `VITE_API_BASE`。

## 常用命令

```bash
npm run lint
npm run test -- --run
npm run build
npm run preview
```

生产构建产物位于 `web/dist/`。Docker 镜像会将该目录复制到 `/app/web/dist`，Go 服务根据后台设置中的 `site.web_domain` 与请求 `Host` 返回用户端页面。

## 目录约定

```text
src/
  api/         用户端接口封装
  components/  页面组件与通用 UI
  features/    生图参数与领域逻辑
  lib/         通用工具函数
  store/       用户、任务与会话状态
  test/        Vitest 测试配置
```

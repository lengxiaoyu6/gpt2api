# GPT2API API Key 生图接口文档

## 基础信息

本文件只整理外部调用生图时会用到的 API Key 接口。用户登录、后台管理、充值、历史记录等接口未纳入本文件。

| 类型 | Base URL | 鉴权方式 |
| --- | --- | --- |
| OpenAI 兼容生图接口 | `https://<domain>/v1` | `Authorization: Bearer sk-...` |

所有 `/v1/*` 生图接口均使用 API Key 鉴权：

```http
Authorization: Bearer sk-xxxxxxxx
```

请求失败时返回 OpenAI 风格错误结构：

```json
{
  "error": {
    "message": "错误信息",
    "type": "invalid_request_error",
    "code": "invalid_request_error"
  }
}
```

常见错误码：

| code | HTTP 状态 | 含义 |
| --- | --- | --- |
| `missing_api_key` | `401` | 缺少 API Key |
| `model_not_allowed` | `403` | API Key 无权调用该模型 |
| `model_not_found` | `400` | 模型不存在或已停用 |
| `model_type_mismatch` | `400` | 模型不是图片模型 |
| `invalid_request_error` | `400` | 请求参数错误 |
| `invalid_reference_image` | `400` | 参考图解析失败 |
| `rate_limit_rpm` | `429` | 触发 RPM 限制 |
| `insufficient_balance` | `402` | 积分不足 |
| `billing_error` | `500` | 计费异常 |
| `upstream_error` | `502` | 上游生图失败 |
| `no_account_available` | `503` | 账号池暂无可用账号 |

## 接口清单

| 方法 | 接口 | 用途 | 鉴权 |
| --- | --- | --- | --- |
| `POST` | `/v1/images/generations` | 文生图，支持 JSON 参考图扩展 | API Key |
| `POST` | `/v1/images/edits` | Multipart 图生图 | API Key |
| `GET` | `/v1/images/tasks/{task_id}` | 查询图片任务 | API Key |

`model` 必须填写图片模型名称。模型名称由后台配置或服务方提供，默认值为 `gpt-image-2`。

## 文生图

```http
POST /v1/images/generations
Authorization: Bearer sk-...
Content-Type: application/json
```

请求体：

```json
{
  "model": "gpt-image-2",
  "prompt": "一只猫，赛博朋克风格",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "style": "vivid",
  "response_format": "url",
  "user": "optional"
}
```

字段规则：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 否 | 默认 `gpt-image-2` |
| `prompt` | string | 是 | 生图提示词 |
| `n` | int | 否 | 默认 `1`，最大 `4`；模型关闭多图能力时按 `1` 处理 |
| `size` | string | 否 | 默认 `1024x1024`；模型关闭输出尺寸能力时会忽略 |
| `response_format` | string | 否 | 当前返回 URL |
| `quality` | string | 否 | 兼容字段 |
| `style` | string | 否 | 兼容字段 |
| `user` | string | 否 | 兼容字段 |

响应示例：

```json
{
  "created": 1710000000,
  "task_id": "img_xxx",
  "data": [
    {
      "url": "/p/img/img_xxx/0?exp=...&sig=...",
      "thumb_url": "/p/thumb/img_xxx/0?exp=...&sig=...",
      "revised_prompt": "",
      "file_id": "file-xxx"
    }
  ]
}
```

计费按实际返回图片数量结算。多图请求在上游返回数量不足时，外置渠道会继续补充到指定数量；如果最终仍失败，会返回错误，成功返回时 `data.length` 为实际出图数量。

## JSON 参考图扩展

`POST /v1/images/generations` 支持非 OpenAI 标准字段 `reference_images`，用于通过 JSON 提交参考图，实现图生图。

```json
{
  "model": "gpt-image-2",
  "prompt": "保持主体姿态，改成油画风格",
  "n": 2,
  "size": "1024x1024",
  "reference_images": [
    "https://example.com/a.png",
    "data:image/png;base64,iVBORw0KGgo..."
  ]
}
```

`reference_images` 支持以下格式：

| 格式 | 示例 |
| --- | --- |
| HTTP 图片地址 | `https://example.com/a.png` |
| data URL | `data:image/png;base64,...` |
| 纯 base64 | `iVBORw0KGgo...` |

限制规则：

| 项目 | 限制 |
| --- | --- |
| 参考图数量 | 最多 `4` 张 |
| 单张大小 | 最大 `20MB` |
| 下载超时 | HTTP 参考图下载超时约 `15s` |

## Multipart 图生图

```http
POST /v1/images/edits
Authorization: Bearer sk-...
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | file | 是 | 主参考图 |
| `image[]` | file | 否 | 多张参考图，可重复提交 |
| `images` | file | 否 | 兼容字段 |
| `images[]` | file | 否 | 兼容字段 |
| `image_1`、`image_2` | file | 否 | 兼容字段 |
| `mask` | file | 否 | 当前作为参考图一并提交 |
| `prompt` | string | 是 | 生图提示词 |
| `model` | string | 否 | 默认 `gpt-image-2` |
| `n` | int | 否 | 默认 `1`，最大 `4` |
| `size` | string | 否 | 默认 `1024x1024` |
| `response_format` | string | 否 | 当前返回 URL |
| `user` | string | 否 | 兼容字段 |

限制规则与 JSON 参考图一致：最多 `4` 张参考图，单张最大 `20MB`。

响应结构与文生图一致：

```json
{
  "created": 1710000000,
  "task_id": "img_xxx",
  "data": [
    {
      "url": "/p/img/img_xxx/0?exp=...&sig=...",
      "thumb_url": "/p/thumb/img_xxx/0?exp=...&sig=...",
      "file_id": "file-xxx"
    }
  ]
}
```

## 查询图片任务

```http
GET /v1/images/tasks/{task_id}
Authorization: Bearer sk-...
```

响应示例：

```json
{
  "task_id": "img_xxx",
  "status": "success",
  "conversation_id": "",
  "created": 1710000000,
  "finished_at": 1710000300,
  "error": "",
  "credit_cost": 10000,
  "data": [
    {
      "url": "/p/img/img_xxx/0?exp=...&sig=...",
      "thumb_url": "/p/thumb/img_xxx/0?exp=...&sig=...",
      "file_id": "file-xxx"
    }
  ]
}
```

常见任务状态：

| status | 含义 |
| --- | --- |
| `queued` | 排队中 |
| `dispatched` | 已派发 |
| `running` | 生成中 |
| `success` | 成功 |
| `failed` | 失败 |

任务只能由所属 API Key 对应用户查询，查询其他用户的任务会返回 `not_found`。

## 图片地址

生图响应中的 `url` 与 `thumb_url` 为图片访问地址。站内签名地址包含 `exp` 与 `sig` 参数，有效期由服务端生成。

## 调用示例

### 文生图

```bash
curl -sS https://<domain>/v1/images/generations \
  -H 'Authorization: Bearer sk-...' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只猫，赛博朋克风格",
    "n": 1,
    "size": "1024x1024"
  }'
```

### JSON 图生图

```bash
curl -sS https://<domain>/v1/images/generations \
  -H 'Authorization: Bearer sk-...' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-image-2",
    "prompt": "保持主体姿态，改成油画风格",
    "n": 2,
    "size": "1024x1024",
    "reference_images": [
      "https://example.com/ref.png"
    ]
  }'
```

### Multipart 图生图

```bash
curl -sS https://<domain>/v1/images/edits \
  -H 'Authorization: Bearer sk-...' \
  -F 'model=gpt-image-2' \
  -F 'prompt=保持主体姿态，改成油画风格' \
  -F 'n=1' \
  -F 'size=1024x1024' \
  -F 'image=@/tmp/ref.png'
```

### 查询任务

```bash
curl -sS https://<domain>/v1/images/tasks/img_xxx \
  -H 'Authorization: Bearer sk-...'
```

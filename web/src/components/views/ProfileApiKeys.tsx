import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import * as apiKeyApi from '../../api/apikey'
import type { ApiKey, NullableDateTime, NullableString } from '../../api/apikey'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatCredit } from '@/lib/utils'

interface ProfileApiKeysProps {
  onBack: () => void
}

interface CreateFormState {
  name: string
  quota_limit: string
  rpm: string
  tpm: string
  allowed_models: string
  allowed_ips: string
}

const PAGE_SIZE = 20

function createEmptyForm(): CreateFormState {
  return {
    name: '',
    quota_limit: '0',
    rpm: '0',
    tpm: '0',
    allowed_models: '',
    allowed_ips: '',
  }
}

function splitCommaText(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseStringList(value: NullableString) {
  if (value == null) return [] as string[]

  const raw = typeof value === 'string'
    ? value
    : value.Valid
      ? value.String
      : ''

  const normalized = raw.trim()
  if (!normalized) return [] as string[]

  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
      }
    } catch {
      // keep fallback split below
    }
  }

  return splitCommaText(normalized)
}

function formatDateTime(value: NullableDateTime) {
  if (!value) return '-'

  const raw = typeof value === 'string'
    ? value
    : value.Valid
      ? value.Time
      : ''

  if (!raw || raw.startsWith('0001-')) return '-'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  const pad = (input: number) => String(input).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatQuota(item: ApiKey) {
  if (item.quota_limit <= 0) {
    return `已用 ${formatCredit(item.quota_used)} / 无限`
  }

  return `${formatCredit(item.quota_used)} / ${formatCredit(item.quota_limit)}`
}

function formatKeyPrefix(prefix: string) {
  const normalized = prefix.trim()
  if (!normalized) return '-'
  return `${normalized}***`
}

function formatListValue(values: string[], emptyText = '不限') {
  return values.length > 0 ? values.join(', ') : emptyText
}

function toInteger(value: string) {
  const numericValue = Number(value.trim())
  return Number.isFinite(numericValue) ? numericValue : 0
}

function ApiKeyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl bg-secondary/20 p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

export default function ProfileApiKeys({ onBack }: ProfileApiKeysProps) {
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [items, setItems] = useState<ApiKey[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(createEmptyForm)
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState('')
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const hasMore = useMemo(() => items.length < total, [items.length, total])

  const loadPage = useCallback(async (nextPage: number, append = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const result = await apiKeyApi.listKeys(nextPage, PAGE_SIZE)
      if (!mountedRef.current) return

      setItems((current) => (append ? [...current, ...result.list] : result.list))
      setTotal(result.total)
      setPage(result.page || nextPage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'API Key 列表加载失败，请稍后重试')
      if (!mountedRef.current) return
      if (!append) {
        setItems([])
        setTotal(0)
        setPage(1)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadPage(1)

    return () => {
      mountedRef.current = false
    }
  }, [loadPage])

  const handleCreateFieldChange = (field: keyof CreateFormState, value: string) => {
    setCreateForm((current) => ({ ...current, [field]: value }))
  }

  const handleOpenCreateDialog = () => {
    setCreateForm(createEmptyForm())
    setCreateDialogOpen(true)
  }

  const handleCreate = async () => {
    const name = createForm.name.trim()
    if (!name) {
      toast.error('请输入 Key 名称')
      return
    }

    setCreating(true)
    try {
      const result = await apiKeyApi.createKey({
        name,
        quota_limit: toInteger(createForm.quota_limit),
        rpm: toInteger(createForm.rpm),
        tpm: toInteger(createForm.tpm),
        allowed_models: splitCommaText(createForm.allowed_models),
        allowed_ips: splitCommaText(createForm.allowed_ips),
      })
      if (!mountedRef.current) return

      setCreateDialogOpen(false)
      setCreateForm(createEmptyForm())
      setCreatedKey(result.key)
      setKeyDialogOpen(true)
      await loadPage(1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'API Key 创建失败，请稍后重试')
    } finally {
      if (mountedRef.current) {
        setCreating(false)
      }
    }
  }

  const handleToggle = async (item: ApiKey) => {
    setUpdatingId(item.id)
    try {
      await apiKeyApi.updateKey(item.id, { enabled: !item.enabled })
      await loadPage(1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'API Key 状态更新失败，请稍后重试')
    } finally {
      if (mountedRef.current) {
        setUpdatingId(null)
      }
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return

    setDeletingId(deleteTarget.id)
    try {
      await apiKeyApi.deleteKey(deleteTarget.id)
      if (!mountedRef.current) return

      setDeleteTarget(null)
      await loadPage(1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'API Key 删除失败，请稍后重试')
    } finally {
      if (mountedRef.current) {
        setDeletingId(null)
      }
    }
  }

  const handleCopyKey = async () => {
    if (!createdKey) return

    try {
      await navigator.clipboard.writeText(createdKey)
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动保存')
    }
  }

  return (
    <>
      <div className="space-y-6 lg:space-y-8">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex items-start gap-3 sm:items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="返回个人中心"
              onClick={onBack}
              className="rounded-2xl"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight lg:text-2xl">API Keys</h2>
              <p className="text-xs text-muted-foreground lg:text-sm">管理当前账号的访问密钥</p>
            </div>
          </div>

          <Button className="h-10 rounded-2xl gap-2" onClick={handleOpenCreateDialog}>
            <Plus className="h-4 w-4" />
            新建 Key
          </Button>
        </div>

        {loading ? (
          <div className="rounded-[2rem] border border-border/50 bg-card/60 p-5 text-sm text-muted-foreground shadow-xl backdrop-blur lg:p-6">
            API Key 列表加载中
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[2rem] border border-border/50 bg-card/60 p-5 shadow-xl backdrop-blur lg:p-6">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <KeyRound className="h-4 w-4 text-primary" />
              <span>API Keys</span>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">还没有 API Key</div>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const allowedModels = formatListValue(parseStringList(item.allowed_models), '全部模型')
              const allowedIps = formatListValue(parseStringList(item.allowed_ips), '不限')
              const toggleLabel = item.enabled ? '禁用' : '启用'
              const updating = updatingId === item.id
              const deleting = deletingId === item.id

              return (
                <Card
                  key={item.id}
                  className="rounded-[1.75rem] border border-border/50 bg-card/70 shadow-sm backdrop-blur"
                >
                  <CardHeader className="gap-3 border-b border-border/40 pb-4">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-black tracking-tight">{item.name}</CardTitle>
                      <div className="font-mono text-xs text-muted-foreground">{formatKeyPrefix(item.key_prefix)}</div>
                    </div>
                    <div className="justify-self-start sm:justify-self-end">
                      <Badge variant={item.enabled ? 'default' : 'outline'}>
                        {item.enabled ? '启用' : '禁用'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ApiKeyField label="额度" value={formatQuota(item)} />
                      <ApiKeyField label="频率" value={`RPM ${item.rpm}`} />
                      <ApiKeyField label="吞吐" value={`TPM ${item.tpm}`} />
                      <ApiKeyField label="允许模型" value={allowedModels} />
                      <ApiKeyField label="IP 白名单" value={allowedIps} />
                      <ApiKeyField label="最近 IP" value={item.last_used_ip?.trim() || '-'} />
                      <ApiKeyField label="最近使用" value={formatDateTime(item.last_used_at)} />
                      <ApiKeyField label="创建时间" value={formatDateTime(item.created_at)} />
                    </div>
                  </CardContent>

                  <CardFooter className="gap-2 border-border/40 bg-secondary/20">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updating || deleting}
                      onClick={() => void handleToggle(item)}
                      className="rounded-xl"
                    >
                      {updating ? '处理中...' : toggleLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={updating || deleting}
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-xl"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}

            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void loadPage(page + 1, true)}
                  className="rounded-2xl"
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl font-black tracking-tight">新建 Key</DialogTitle>
            <DialogDescription>创建成功后，明文 Key 只会展示一次。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6">
            <div className="space-y-2">
              <label htmlFor="profile-api-key-name" className="text-sm font-bold text-foreground">名称</label>
              <Input
                id="profile-api-key-name"
                value={createForm.name}
                onChange={(event) => handleCreateFieldChange('name', event.target.value)}
                placeholder="请输入 Key 名称"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="profile-api-key-quota" className="text-sm font-bold text-foreground">额度</label>
                <Input
                  id="profile-api-key-quota"
                  type="number"
                  value={createForm.quota_limit}
                  onChange={(event) => handleCreateFieldChange('quota_limit', event.target.value)}
                  placeholder="0 表示无限"
                  className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="profile-api-key-rpm" className="text-sm font-bold text-foreground">RPM</label>
                <Input
                  id="profile-api-key-rpm"
                  type="number"
                  value={createForm.rpm}
                  onChange={(event) => handleCreateFieldChange('rpm', event.target.value)}
                  placeholder="每分钟请求数"
                  className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-api-key-tpm" className="text-sm font-bold text-foreground">TPM</label>
              <Input
                id="profile-api-key-tpm"
                type="number"
                value={createForm.tpm}
                onChange={(event) => handleCreateFieldChange('tpm', event.target.value)}
                placeholder="每分钟 Token 数"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-api-key-models" className="text-sm font-bold text-foreground">允许模型</label>
              <Input
                id="profile-api-key-models"
                value={createForm.allowed_models}
                onChange={(event) => handleCreateFieldChange('allowed_models', event.target.value)}
                placeholder="使用逗号分隔多个模型"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-api-key-ips" className="text-sm font-bold text-foreground">IP 白名单</label>
              <Input
                id="profile-api-key-ips"
                value={createForm.allowed_ips}
                onChange={(event) => handleCreateFieldChange('allowed_ips', event.target.value)}
                placeholder="使用逗号分隔多个 IP"
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 text-sm"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreate()
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="mt-6 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={() => setCreateDialogOpen(false)}
            >
              取消
            </Button>
            <Button className="h-11 rounded-2xl" disabled={creating} onClick={() => void handleCreate()}>
              {creating ? '创建中...' : '创建 Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={keyDialogOpen}
        onOpenChange={(open) => {
          setKeyDialogOpen(open)
          if (!open) {
            setCreatedKey('')
          }
        }}
      >
        <DialogContent className="max-w-md rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl font-black tracking-tight">请保存 API Key</DialogTitle>
            <DialogDescription>明文 Key 仅展示一次，关闭后无法再次查看。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-6">
            <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>建议立即复制并保存到安全位置。</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-created-api-key" className="text-sm font-bold text-foreground">API Key</label>
              <Input
                id="profile-created-api-key"
                readOnly
                value={createdKey}
                className="h-12 rounded-2xl border-border/60 bg-secondary/20 px-4 font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter className="mt-6 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button variant="outline" className="h-11 rounded-2xl gap-2" onClick={() => void handleCopyKey()}>
              <Copy className="h-4 w-4" />
              复制 Key
            </Button>
            <Button className="h-11 rounded-2xl" onClick={() => setKeyDialogOpen(false)}>
              我已保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-[28px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur" showCloseButton={false}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl font-black tracking-tight">删除 Key</DialogTitle>
            <DialogDescription className="flex items-start gap-2 text-sm">
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>确认删除这个 API Key 吗？</span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-1 text-sm text-muted-foreground">
            删除后将无法恢复，现有调用也会立即失效。
          </div>

          <DialogFooter className="mt-4 rounded-b-[28px] border-border/60 bg-secondary/20 px-6 py-4">
            <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              className="h-11 rounded-2xl"
              disabled={deletingId === deleteTarget?.id}
              onClick={() => void handleConfirmDelete()}
            >
              {deletingId === deleteTarget?.id ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

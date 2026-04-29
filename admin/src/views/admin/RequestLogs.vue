<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import * as statsApi from '@/api/stats'
import { ENABLE_CHAT_MODEL } from '@/config/feature'
import { formatCredit, formatDateTime, formatErrorCode } from '@/utils/format'

const loading = ref(false)
const rows = ref<statsApi.UsageLogItem[]>([])
const total = ref(0)
const detailDlg = ref(false)
const detailRow = ref<statsApi.UsageLogItem | null>(null)

const filter = reactive({
  user_id: '',
  key_id: '',
  model_id: '',
  account_id: '',
  type: '' as '' | 'chat' | 'image',
  status: '' as '' | 'success' | 'failed',
  range: [] as Date[],
  page: 1,
  page_size: 50,
})

const offset = computed(() => (filter.page - 1) * filter.page_size)

function toInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toRFC3339(value: Date): string | undefined {
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
}

function buildParams(): statsApi.UsageLogFilter {
  const params: statsApi.UsageLogFilter = {
    limit: filter.page_size,
    offset: offset.value,
    user_id: toInt(filter.user_id),
    key_id: toInt(filter.key_id),
    model_id: toInt(filter.model_id),
    account_id: toInt(filter.account_id),
    type: filter.type || undefined,
    status: filter.status || undefined,
  }
  if (filter.range.length === 2) {
    params.since = toRFC3339(filter.range[0])
    params.until = toRFC3339(filter.range[1])
  }
  return params
}

async function load() {
  loading.value = true
  try {
    const data = await statsApi.listUsageLogs(buildParams())
    rows.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  filter.page = 1
  load()
}

function onReset() {
  filter.user_id = ''
  filter.key_id = ''
  filter.model_id = ''
  filter.account_id = ''
  filter.type = ''
  filter.status = ''
  filter.range = []
  filter.page = 1
  load()
}

function onPageChange(page: number) {
  filter.page = page
  load()
}

function onSizeChange(size: number) {
  filter.page_size = size
  filter.page = 1
  load()
}

function openDetail(row: statsApi.UsageLogItem) {
  detailRow.value = row
  detailDlg.value = true
}

function totalTokens(row: statsApi.UsageLogItem): number {
  return row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens
}

function typeText(type: string): string {
  if (type === 'chat') return '对话'
  if (type === 'image') return '生图'
  return type || '-'
}

function statusText(status: string): string {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  return status || '-'
}

const statusType: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  success: 'success',
  failed: 'danger',
}

const typeTag: Record<string, 'primary' | 'warning' | 'info'> = {
  chat: 'primary',
  image: 'warning',
}

onMounted(load)
</script>

<template>
  <div class="page-container request-logs-page">
    <div class="card-block">
      <div class="flex-between request-logs-head">
        <div>
          <h2 class="page-title" style="margin:0">请求记录</h2>
          <div class="page-subtitle">
            全站请求明细，包含用户、模型、账号、Token、扣费、耗时、IP 与状态信息。
          </div>
        </div>
        <el-button type="primary" :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <el-form class="request-filter" @submit.prevent="onSearch">
        <el-input
          v-model="filter.user_id"
          placeholder="用户 ID"
          clearable
          inputmode="numeric"
          @keyup.enter="onSearch"
        />
        <el-input
          v-model="filter.key_id"
          placeholder="Key ID"
          clearable
          inputmode="numeric"
          @keyup.enter="onSearch"
        />
        <el-input
          v-model="filter.model_id"
          placeholder="模型 ID"
          clearable
          inputmode="numeric"
          @keyup.enter="onSearch"
        />
        <el-input
          v-model="filter.account_id"
          placeholder="账号 ID"
          clearable
          inputmode="numeric"
          @keyup.enter="onSearch"
        />
        <el-select v-model="filter.type" placeholder="类型" clearable>
          <el-option label="全部类型" value="" />
          <el-option v-if="ENABLE_CHAT_MODEL" label="对话" value="chat" />
          <el-option label="生图" value="image" />
        </el-select>
        <el-select v-model="filter.status" placeholder="状态" clearable>
          <el-option label="全部状态" value="" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-date-picker
          v-model="filter.range"
          type="datetimerange"
          unlink-panels
          range-separator="~"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm"
          class="range-picker"
        />
        <div class="filter-actions">
          <el-button type="primary" @click="onSearch">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="onReset">重置</el-button>
        </div>
      </el-form>

      <div class="table-wrap">
        <el-table
          v-loading="loading"
          :data="rows"
          stripe
          size="small"
          style="margin-top:14px;width:100%"
          empty-text="暂无请求记录"
        >
          <el-table-column prop="id" label="ID" width="82" />
          <el-table-column label="请求 ID" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">
              <code class="request-id">{{ row.request_id || '-' }}</code>
            </template>
          </el-table-column>
          <el-table-column label="用户" width="110">
            <template #default="{ row }">
              <span>#{{ row.user_id || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Key" width="100">
            <template #default="{ row }">#{{ row.key_id || '-' }}</template>
          </el-table-column>
          <el-table-column label="模型" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="model-cell">
                <code>{{ row.model_slug || `#${row.model_id}` }}</code>
                <span v-if="row.model_slug" class="muted">#{{ row.model_id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="账号" width="100">
            <template #default="{ row }">#{{ row.account_id || '-' }}</template>
          </el-table-column>
          <el-table-column label="类型" width="86">
            <template #default="{ row }">
              <el-tag size="small" :type="typeTag[row.type] || 'info'">{{ typeText(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <div class="status-cell">
                <el-tag size="small" :type="statusType[row.status] || 'info'">
                  {{ statusText(row.status) }}
                </el-tag>
                <span v-if="row.error_code" class="error-code">{{ formatErrorCode(row.error_code) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="Token" width="150">
            <template #default="{ row }">
              <div>{{ totalTokens(row) }}</div>
              <div class="muted">入 {{ row.input_tokens }} / 出 {{ row.output_tokens }}</div>
            </template>
          </el-table-column>
          <el-table-column label="缓存" width="130">
            <template #default="{ row }">
              <div>读 {{ row.cache_read_tokens }}</div>
              <div class="muted">写 {{ row.cache_write_tokens }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="image_count" label="图数" width="80" />
          <el-table-column label="扣费" width="110">
            <template #default="{ row }">{{ formatCredit(row.credit_cost) }}</template>
          </el-table-column>
          <el-table-column label="耗时" width="100">
            <template #default="{ row }">{{ row.duration_ms }} ms</template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="130" show-overflow-tooltip />
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="82" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-pagination
        class="request-pagination"
        :current-page="filter.page"
        :page-size="filter.page_size"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        layout="total, sizes, prev, pager, next"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-dialog v-model="detailDlg" title="请求详情" width="760px">
      <el-descriptions v-if="detailRow" :column="2" border size="small">
        <el-descriptions-item label="ID">{{ detailRow.id }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(detailRow.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="请求 ID" :span="2">
          <code class="request-id detail-request-id">{{ detailRow.request_id || '-' }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="用户 ID">{{ detailRow.user_id }}</el-descriptions-item>
        <el-descriptions-item label="Key ID">{{ detailRow.key_id }}</el-descriptions-item>
        <el-descriptions-item label="模型 ID">{{ detailRow.model_id }}</el-descriptions-item>
        <el-descriptions-item label="模型">{{ detailRow.model_slug || '-' }}</el-descriptions-item>
        <el-descriptions-item label="账号 ID">{{ detailRow.account_id }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ typeText(detailRow.type) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(detailRow.status) }}</el-descriptions-item>
        <el-descriptions-item label="错误码">{{ formatErrorCode(detailRow.error_code) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="输入 Token">{{ detailRow.input_tokens }}</el-descriptions-item>
        <el-descriptions-item label="输出 Token">{{ detailRow.output_tokens }}</el-descriptions-item>
        <el-descriptions-item label="缓存读取">{{ detailRow.cache_read_tokens }}</el-descriptions-item>
        <el-descriptions-item label="缓存写入">{{ detailRow.cache_write_tokens }}</el-descriptions-item>
        <el-descriptions-item label="图片数量">{{ detailRow.image_count }}</el-descriptions-item>
        <el-descriptions-item label="扣费">{{ formatCredit(detailRow.credit_cost) }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ detailRow.duration_ms }} ms</el-descriptions-item>
        <el-descriptions-item label="IP">{{ detailRow.ip || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.request-logs-head {
  align-items: flex-start;
  margin-bottom: 14px;
}

.page-subtitle {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 4px;
}

.request-filter {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 10px;
  align-items: center;

  .range-picker {
    grid-column: span 3;
    width: 100%;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
}

.request-id {
  display: inline-block;
  max-width: 100%;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  vertical-align: middle;
}

.detail-request-id {
  white-space: normal;
  word-break: break-all;
}

.model-cell,
.status-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.muted,
.error-code {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.error-code {
  color: var(--el-color-danger);
}

.request-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1200px) {
  .request-filter {
    grid-template-columns: repeat(3, minmax(120px, 1fr));

    .range-picker {
      grid-column: span 2;
    }
  }
}

@media (max-width: 767px) {
  .request-logs-head {
    gap: 10px;
  }

  .request-filter {
    grid-template-columns: 1fr;

    .range-picker,
    .filter-actions {
      grid-column: span 1;
    }

    .filter-actions {
      justify-content: flex-start;
    }
  }
}
</style>

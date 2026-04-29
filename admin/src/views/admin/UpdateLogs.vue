<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/utils/format'
import {
  adminCreateUpdateLog,
  adminDeleteUpdateLog,
  adminListUpdateLogs,
  adminUpdateUpdateLog,
  type UpdateLog,
  type UpdateLogPayload,
} from '@/api/update-log'

const rows = ref<UpdateLog[]>([])
const total = ref(0)
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingID = ref<number | null>(null)
const page = reactive({ limit: 20, offset: 0 })

const form = reactive<UpdateLogPayload>({
  version: '',
  title: '',
  content: '',
  enabled: true,
  sort_order: 0,
  published_at: null,
})

const currentPage = computed({
  get: () => Math.floor(page.offset / page.limit) + 1,
  set: (value: number) => {
    page.offset = Math.max(0, value - 1) * page.limit
  },
})

async function load() {
  loading.value = true
  try {
    const data = await adminListUpdateLogs({ limit: page.limit, offset: page.offset })
    rows.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingID.value = null
  form.version = ''
  form.title = ''
  form.content = ''
  form.enabled = true
  form.sort_order = 0
  form.published_at = null
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: UpdateLog) {
  editingID.value = row.id
  form.version = row.version || ''
  form.title = row.title
  form.content = row.content
  form.enabled = row.enabled
  form.sort_order = row.sort_order
  form.published_at = row.published_at || null
  dialogVisible.value = true
}

function validateForm() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入日志标题')
    return false
  }
  if (!form.content.trim()) {
    ElMessage.warning('请输入更新内容')
    return false
  }
  if (form.version.trim().length > 64) {
    ElMessage.warning('版本号最多 64 个字符')
    return false
  }
  if (form.title.trim().length > 160) {
    ElMessage.warning('日志标题最多 160 个字符')
    return false
  }
  if (form.content.trim().length > 10000) {
    ElMessage.warning('更新内容最多 10000 个字符')
    return false
  }
  return true
}

function buildPayload(): UpdateLogPayload {
  return {
    version: form.version.trim(),
    title: form.title.trim(),
    content: form.content.trim(),
    enabled: form.enabled,
    sort_order: Number(form.sort_order) || 0,
    published_at: form.published_at || null,
  }
}

async function submit() {
  if (!validateForm()) return
  submitting.value = true
  try {
    const payload = buildPayload()
    if (editingID.value) {
      await adminUpdateUpdateLog(editingID.value, payload)
      ElMessage.success('更新日志已保存')
    } else {
      await adminCreateUpdateLog(payload)
      ElMessage.success('更新日志已创建')
    }
    dialogVisible.value = false
    await load()
  } finally {
    submitting.value = false
  }
}

async function remove(row: UpdateLog) {
  const confirmed = await ElMessageBox.confirm(
    `确认删除更新日志“${row.title}”？`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(() => true).catch(() => false)
  if (!confirmed || !row.id) return
  await adminDeleteUpdateLog(row.id)
  ElMessage.success('更新日志已删除')
  await load()
}

async function handleSizeChange(size: number) {
  page.limit = size
  page.offset = 0
  await load()
}

async function handleCurrentChange(value: number) {
  currentPage.value = value
  await load()
}

function contentSummary(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= 80) return text
  return `${text.slice(0, 80)}…`
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <div class="card-block">
      <div class="flex-between update-log-head">
        <div>
          <h2 class="page-title" style="margin: 0">系统更新日志</h2>
          <div class="update-log-subtitle">维护 web 用户端可查看的系统更新记录，启用状态的日志会公开展示。</div>
        </div>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增日志
        </el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="version" label="版本" width="120">
          <template #default="{ row }">{{ row.version || '—' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="内容摘要" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ contentSummary(row.content) }}</template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="90" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="190">
          <template #default="{ row }">{{ formatDateTime(row.published_at || row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="190">
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">修改</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="update-log-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="page.limit"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingID ? '修改更新日志' : '新增更新日志'"
      width="680px"
      @closed="resetForm"
    >
      <el-form label-width="96px">
        <el-form-item label="版本号">
          <el-input v-model.trim="form.version" maxlength="64" show-word-limit placeholder="例如 v1.2.0，可留空" />
        </el-form-item>
        <el-form-item label="日志标题" required>
          <el-input v-model.trim="form.title" maxlength="160" show-word-limit placeholder="请输入日志标题" />
        </el-form-item>
        <el-form-item label="更新内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="10"
            maxlength="10000"
            show-word-limit
            placeholder="请输入更新内容，支持换行展示"
          />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sort_order" :min="-999999" :max="999999" />
          <span class="form-tip">数值越大越靠前，同排序按发布时间倒序展示</span>
        </el-form-item>
        <el-form-item label="发布时间">
          <el-date-picker
            v-model="form.published_at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            placeholder="默认使用创建时间"
            clearable
          />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.update-log-head {
  margin-bottom: 14px;
}

.update-log-subtitle,
.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.update-log-subtitle {
  margin-top: 4px;
}

.form-tip {
  margin-left: 10px;
}

.update-log-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

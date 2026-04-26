<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminListAnnouncements,
  adminUpdateAnnouncement,
  type Announcement,
  type AnnouncementPayload,
} from '@/api/announcement'

const rows = ref<Announcement[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingID = ref<number | null>(null)

const form = reactive<AnnouncementPayload>({
  title: '',
  content: '',
  enabled: true,
  sort_order: 0,
})

async function load() {
  loading.value = true
  try {
    const data = await adminListAnnouncements()
    rows.value = data.items || []
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingID.value = null
  form.title = ''
  form.content = ''
  form.enabled = true
  form.sort_order = 0
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: Announcement) {
  editingID.value = row.id
  form.title = row.title
  form.content = row.content
  form.enabled = row.enabled
  form.sort_order = row.sort_order
  dialogVisible.value = true
}

function validateForm() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入公告标题')
    return false
  }
  if (!form.content.trim()) {
    ElMessage.warning('请输入公告内容')
    return false
  }
  if (form.title.trim().length > 120) {
    ElMessage.warning('公告标题最多 120 个字符')
    return false
  }
  if (form.content.trim().length > 5000) {
    ElMessage.warning('公告内容最多 5000 个字符')
    return false
  }
  return true
}

async function submit() {
  if (!validateForm()) return
  submitting.value = true
  const payload = {
    title: form.title.trim(),
    content: form.content.trim(),
    enabled: form.enabled,
    sort_order: Number(form.sort_order) || 0,
  }
  try {
    if (editingID.value) {
      await adminUpdateAnnouncement(editingID.value, payload)
      ElMessage.success('公告已保存')
    } else {
      await adminCreateAnnouncement(payload)
      ElMessage.success('公告已创建')
    }
    dialogVisible.value = false
    await load()
  } finally {
    submitting.value = false
  }
}

async function remove(row: Announcement) {
  const confirmed = await ElMessageBox.confirm(`确认删除公告“${row.title}”？`, '删除确认', { type: 'warning' })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  if (!row.id) return
  await adminDeleteAnnouncement(row.id)
  ElMessage.success('公告已删除')
  await load()
}

function fmtTime(value: string) {
  return value || '—'
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <div class="card-block">
      <div class="flex-between announcement-head">
        <div>
          <h2 class="page-title" style="margin: 0">公告管理</h2>
          <div class="announcement-subtitle">维护多条弹窗公告，启用公告会展示在个人中心与 WAP 首页。</div>
        </div>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增公告
        </el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
        <el-table-column prop="sort_order" label="排序" width="90" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="190">
          <template #default="{ row }">{{ fmtTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">修改</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingID ? '修改公告' : '新增公告'"
      width="620px"
      @closed="resetForm"
    >
      <el-form label-width="92px">
        <el-form-item label="公告标题" required>
          <el-input v-model.trim="form.title" maxlength="120" show-word-limit placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="公告内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            maxlength="5000"
            show-word-limit
            placeholder="请输入公告内容"
          />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sort_order" :min="-999999" :max="999999" />
          <span class="form-tip">数值越大越靠前</span>
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
.announcement-head {
  margin-bottom: 14px;
}

.announcement-subtitle,
.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.announcement-subtitle {
  margin-top: 4px;
}

.form-tip {
  margin-left: 10px;
}
</style>

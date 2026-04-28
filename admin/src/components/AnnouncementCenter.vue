<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listPublicAnnouncements, type Announcement } from '@/api/announcement'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const READ_KEY = 'gpt2api.announcement.read.ids'

const rows = ref<Announcement[]>([])
const loading = ref(false)
const loaded = ref(false)
const dialogVisible = ref(false)
const listVisible = ref(false)
const current = ref<Announcement | null>(null)

const hasItems = computed(() => rows.value.length > 0)

function readIDs(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || '[]')
    if (Array.isArray(parsed)) {
      return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    }
  } catch {
    return []
  }
  return []
}

function writeIDs(ids: number[]) {
  const uniq = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)))
  localStorage.setItem(READ_KEY, JSON.stringify(uniq))
}

function markRead(id: number) {
  writeIDs([...readIDs(), id])
}

async function load() {
  if (!props.active || loading.value || loaded.value) return
  loading.value = true
  try {
    const data = await listPublicAnnouncements()
    rows.value = data.items || []
    loaded.value = true
    const read = new Set(readIDs())
    const firstUnread = rows.value.find((item) => !read.has(item.id))
    if (firstUnread) {
      current.value = firstUnread
      dialogVisible.value = true
    }
  } catch {
    ElMessage.error('公告加载失败')
  } finally {
    loading.value = false
  }
}

function acknowledge() {
  if (current.value) markRead(current.value.id)
  dialogVisible.value = false
}

function openList() {
  listVisible.value = true
  load()
}

watch(() => props.active, (active) => {
  if (active) load()
})

onMounted(load)
</script>

<template>
  <div v-if="active" class="announcement-center">
    <el-button link class="announcement-entry" :loading="loading" @click="openList">
      <el-icon><Bell /></el-icon>
      <span>公告</span>
    </el-button>

    <el-dialog v-model="dialogVisible" title="公告" width="520px" append-to-body>
      <div v-if="current" class="announcement-popup">
        <h3>{{ current.title }}</h3>
        <div class="announcement-content">{{ current.content }}</div>
      </div>
      <template #footer>
        <el-button @click="listVisible = true">公告列表</el-button>
        <el-button type="primary" @click="acknowledge">知道了</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="listVisible" title="公告列表" width="680px" append-to-body>
      <el-empty v-if="!loading && !hasItems" description="暂无公告" />
      <div v-else v-loading="loading" class="announcement-list">
        <el-card v-for="item in rows" :key="item.id" shadow="never" class="announcement-card">
          <template #header>
            <div class="announcement-card-head">
              <strong>{{ item.title }}</strong>
              <el-tag size="small" type="info">#{{ item.id }}</el-tag>
            </div>
          </template>
          <div class="announcement-content">{{ item.content }}</div>
        </el-card>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.announcement-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
}

.announcement-popup h3 {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.4;
}

.announcement-content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}

.announcement-list {
  display: grid;
  gap: 12px;
  min-height: 120px;
}

.announcement-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>

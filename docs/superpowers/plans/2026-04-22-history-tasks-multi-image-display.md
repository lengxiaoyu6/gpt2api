# 历史任务多图拆分展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将历史任务页中的多图生成任务按图片拆分成多张连续卡片展示，并保留任务级预览与删除语义。

**Architecture:** 保持 `/api/me/images/tasks` 的任务级返回结构不变，在 `HistoryTasks.vue` 内新增派生展示列表，把每个 `ImageTask` 展开成若干图片卡片项。模板与预览入口切换到派生项字段，删除仍透传原始任务对象，静态测试补充对应断言。

**Tech Stack:** Vue 3 Script Setup、TypeScript、Element Plus、Node 内置测试运行器

---

### Task 1: 先写失败测试覆盖多图拆分展示

**Files:**
- Modify: `web/tests/history-tasks.node.test.mjs`
- Test: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 在静态测试中加入多图拆分断言**

```js
test('历史任务页面按图片拆分多图任务展示', () => {
  const pageVue = read('web/src/views/personal/HistoryTasks.vue')
  assert.match(pageVue, /const flattenedImageTasks = computed\(\(\) =>/)
  assert.match(pageVue, /imageTasks\.value\.flatMap\(/)
  assert.match(pageVue, /v-for="item in flattenedImageTasks"/)
  assert.match(pageVue, /@click="openPreview\(item\.task\.image_urls, item\.image_index\)"/)
  assert.match(pageVue, /@click\.stop="onDeleteTask\(item\.task\)"/)
  assert.match(pageVue, /第\{\{ item\.image_index \+ 1 \}\}张，共\{\{ item\.image_total \}\}张/)
})
```

- [ ] **Step 2: 运行测试，确认新增断言失败**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: FAIL，提示 `flattenedImageTasks`、新的 `v-for` 或新的预览绑定尚未出现在 `HistoryTasks.vue` 中。

### Task 2: 修改历史任务页面，按图片展开卡片

**Files:**
- Modify: `web/src/views/personal/HistoryTasks.vue`
- Test: `web/tests/history-tasks.node.test.mjs`

- [ ] **Step 1: 引入计算属性并定义派生展示项**

```ts
import { computed, onMounted, ref } from 'vue';

type FlattenedImageTask = {
  task: ImageTask;
  image_url: string;
  image_index: number;
  image_total: number;
  image_key: string;
};
```

- [ ] **Step 2: 实现按图片展开的最小逻辑**

```ts
const flattenedImageTasks = computed(() =>
  imageTasks.value.flatMap((task) => {
    const urls = task.image_urls?.length ? task.image_urls : [''];
    const imageTotal = task.image_urls?.length || 0;
    return urls.map((imageURL, index) => ({
      task,
      image_url: imageURL,
      image_index: index,
      image_total: imageTotal,
      image_key: `${task.task_id}-${index}`,
    }));
  }),
);
```

- [ ] **Step 3: 把模板循环与展示字段切换为派生项**

```vue
<el-card v-for="item in flattenedImageTasks" :key="item.image_key" shadow="hover" class="img-card">
  <div class="thumb" :class="{ 'is-clickable': !!item.image_url }" @click="openPreview(item.task.image_urls, item.image_index)">
    <img v-if="item.image_url" :src="item.image_url" :alt="item.task.prompt" />
  </div>
</el-card>
```

- [ ] **Step 4: 在元信息区补充位置标识并保留任务级删除**

```vue
<div class="sub">
  <el-tag size="small" :type="statusTag(item.task.status)">{{ statusLabel(item.task.status) }}</el-tag>
  <span>{{ item.task.size }}</span>
  <span class="mute">{{ item.image_total ? `第${item.image_index + 1}张，共${item.image_total}张` : '结果图缺失' }}</span>
</div>
<el-button
  link
  type="danger"
  size="small"
  :loading="deletingTaskID === item.task.task_id"
  @click.stop="onDeleteTask(item.task)"
>
  {{ deletingTaskID === item.task.task_id ? '删除中...' : '删除' }}
</el-button>
```

- [ ] **Step 5: 运行静态测试，确认通过**

Run: `cd web && node --test tests/history-tasks.node.test.mjs`
Expected: PASS，包含新增的多图拆分展示断言。

### Task 3: 运行回归验证

**Files:**
- Modify: `web/src/views/personal/HistoryTasks.vue`
- Modify: `web/tests/history-tasks.node.test.mjs`
- Test: `web/tests/history-tasks.node.test.mjs`, `web/tests/history-tasks-delete.node.test.mjs`

- [ ] **Step 1: 运行前端静态回归测试**

Run: `cd web && node --test tests/history-tasks.node.test.mjs tests/history-tasks-delete.node.test.mjs`
Expected: PASS，历史任务页与删除能力断言全部通过。

- [ ] **Step 2: 运行前端构建**

Run: `cd web && npm run build`
Expected: PASS，输出生产构建结果；允许保留仓库既有 Sass legacy API warning 与 chunk size warning。

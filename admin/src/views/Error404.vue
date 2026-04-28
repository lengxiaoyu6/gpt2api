<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<template>
  <div class="err-page">
    <el-result icon="warning" title="404" sub-title="页面不存在，返回后台首页继续处理管理事务。">
      <template #extra>
        <el-button type="primary" @click="router.replace('/admin/dashboard')">返回后台首页</el-button>
      </template>
    </el-result>
  </div>
</template>
<style scoped>
.err-page{min-height:100vh;display:flex;align-items:center;justify-content:center;}
</style>

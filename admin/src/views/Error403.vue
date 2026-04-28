<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<template>
  <div class="err-page">
    <el-result icon="error" title="403" sub-title="当前账号没有访问后台页面的权限。">
      <template #extra>
        <el-button @click="router.replace('/admin/dashboard')">返回后台首页</el-button>
      </template>
    </el-result>
  </div>
</template>
<style scoped>
.err-page{min-height:100vh;display:flex;align-items:center;justify-content:center;}
</style>

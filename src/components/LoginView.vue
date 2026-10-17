<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const message = useMessage()

const mode = ref<string>('login')
const username = ref('')
const password = ref('')
const submitting = ref(false)

function validate(): string | null {
  const name = username.value.trim()
  if (name.length < 3 || name.length > 20) return '用户名需为 3-20 个字符'
  if (password.value.length < 6) return '密码至少 6 位'
  return null
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const problem = validate()
  if (problem) {
    message.warning(problem)
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value.trim(), password.value)
    } else {
      await auth.register(username.value.trim(), password.value)
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '操作失败，请稍后再试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <n-card class="login-card" :bordered="false">
      <h1 class="app-title">TinyPendingItem</h1>

      <n-tabs v-model:value="mode" type="segment" class="login-tabs" size="large">
        <n-tab name="login">登录</n-tab>
        <n-tab name="register">注册</n-tab>
      </n-tabs>

      <div class="login-fields">
        <n-input
          v-model:value="username"
          size="large"
          placeholder="用户名（3-20 个字符）"
          @keyup.enter="submit"
        />
        <n-input
          v-model:value="password"
          size="large"
          type="password"
          show-password-on="click"
          placeholder="密码（至少 6 位）"
          @keyup.enter="submit"
        />
        <n-button type="primary" size="large" block :loading="submitting" @click="submit">
          {{ mode === 'login' ? '登录' : '注册并登录' }}
        </n-button>
      </div>
    </n-card>
  </div>
</template>

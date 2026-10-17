<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import { darkTheme, dateZhCN, NConfigProvider, NMessageProvider, NSpin, zhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import LoginView from './components/LoginView.vue'
import TodoApp from './components/TodoApp.vue'

const auth = useAuthStore()
const theme = useThemeStore()

/** 个性化主题色 + 统一圆角 */
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: theme.accent.primary,
    primaryColorHover: theme.accent.hover,
    primaryColorPressed: theme.accent.pressed,
    primaryColorSuppl: theme.accent.hover,
    borderRadius: '10px',
  },
}))

watchEffect(() => {
  document.body.classList.toggle('dark', theme.dark)
})

onMounted(() => {
  void auth.init()
})
</script>

<template>
  <n-config-provider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="theme.dark ? darkTheme : undefined"
    :theme-overrides="themeOverrides"
  >
    <n-message-provider>
      <div class="page">
        <div class="bg-blob b1"></div>
        <div class="bg-blob b2"></div>
        <div class="bg-blob b3"></div>
        <Transition name="page" mode="out-in">
          <div v-if="auth.initializing" key="loading" class="page-loading">
            <n-spin size="medium" />
          </div>
          <LoginView v-else-if="!auth.isAuthenticated" key="login" />
          <TodoApp v-else key="app" />
        </Transition>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

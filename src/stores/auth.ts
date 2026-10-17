import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client'
import type { AvatarSpec } from '../utils/avatar'
import type { User } from '../types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<User | null>(null)
  const initializing = ref(token.value !== null)

  setUnauthorizedHandler(() => {
    token.value = null
    user.value = null
  })

  const isAuthenticated = computed(() => user.value !== null)

  async function init(): Promise<void> {
    if (!token.value) {
      initializing.value = false
      return
    }
    try {
      user.value = (await api.me()).user
    } catch {
      token.value = null
      user.value = null
    } finally {
      initializing.value = false
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const result = await api.login(username, password)
    token.value = result.token
    user.value = result.user
    setToken(result.token)
  }

  async function register(username: string, password: string): Promise<void> {
    const result = await api.register(username, password)
    token.value = result.token
    user.value = result.user
    setToken(result.token)
  }

  function logout(): void {
    setToken(null)
    token.value = null
    user.value = null
  }

  async function updateAvatar(avatar: AvatarSpec | ''): Promise<void> {
    const result = await api.updateAvatar(avatar)
    user.value = result.user
  }

  return { token, user, initializing, isAuthenticated, init, login, register, logout, updateAvatar }
})

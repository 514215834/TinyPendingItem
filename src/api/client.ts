import type { PendingItem, Priority, User } from '../types'
import type { AvatarSpec } from '../utils/avatar'

const TOKEN_KEY = 'tiny-pending-item:token'

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

function readToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getToken(): string | null {
  return readToken()
}

export function setToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = readToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (res.status === 401) {
    setToken(null)
    unauthorizedHandler?.()
    throw new ApiError(401, '登录状态已失效，请重新登录')
  }

  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    try {
      const data: unknown = await res.json()
      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        message = data.error
      }
    } catch {
      // 非 JSON 响应体时使用默认文案
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export interface NewItemOptions {
  priority?: Priority
  dueAt?: number | null
  tags?: string[]
  notes?: string
}

export interface ItemPatch {
  title?: string
  notes?: string
  done?: boolean
  priority?: Priority
  dueAt?: number | null
  tags?: string[]
  pinned?: boolean
}

export interface ExportPayload {
  app: string
  version: number
  exportedAt: number
  items: PendingItem[]
}

export interface ImportResult {
  imported: number
  skipped: number
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    }),
  me: () => request<{ user: User }>('/api/auth/me'),
  updateAvatar: (avatar: AvatarSpec | '') =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: { avatar } }),
  listItems: () => request<{ items: PendingItem[] }>('/api/items'),
  addItem: (title: string, options: NewItemOptions = {}) =>
    request<{ item: PendingItem }>('/api/items', {
      method: 'POST',
      body: { title, ...options },
    }),
  updateItem: (id: number, patch: ItemPatch) =>
    request<{ item: PendingItem }>(`/api/items/${id}`, { method: 'PATCH', body: patch }),
  deleteItem: (id: number) => request<void>(`/api/items/${id}`, { method: 'DELETE' }),
  reorder: (orderedIds: number[]) =>
    request<{ updated: number }>('/api/items/reorder', {
      method: 'POST',
      body: { orderedIds },
    }),
  clearCompleted: () => request<{ removed: number }>('/api/items/clear-completed', { method: 'POST' }),
  exportItems: () => request<ExportPayload>('/api/items/export'),
  importItems: (items: unknown[]) =>
    request<ImportResult>('/api/items/import', { method: 'POST', body: { items } }),
}

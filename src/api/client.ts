/**
 * 纯前端版数据层：无后端，账号与待办数据全部存于 localStorage。
 *
 * 导出面（api / setToken / getToken / setUnauthorizedHandler / ApiError、各类参类型）
 * 与服务端版完全一致，stores 与组件无需感知差异；
 * 校验规则与错误文案对齐 server/items.ts、server/auth.ts。
 *
 * 存储键：
 * - tiny-pending-item:token           会话（JSON {v, uid}，沿用原键名）
 * - tiny-pending-item:local:users     全部本地账号（含口令哈希）
 * - tiny-pending-item:local:items:×   各账号条目（按 userId 分键）
 * - tiny-pending-item:local:seq       递增 id 高水位
 */

import { PRIORITIES } from '../types'
import type { PendingItem, Priority, User } from '../types'
import type { AvatarSpec } from '../utils/avatar'

const TOKEN_KEY = 'tiny-pending-item:token'
const USERS_KEY = 'tiny-pending-item:local:users'
const SEQ_KEY = 'tiny-pending-item:local:seq'
const ITEMS_KEY_PREFIX = 'tiny-pending-item:local:items:'

const SESSION_VERSION = 1
const MAX_TITLE = 50
const MAX_NOTES = 2000
const MAX_TAGS = 5
const MAX_TAG_LENGTH = 20
const MAX_IMPORT = 1000

interface LocalUser {
  id: number
  username: string
  passwordHash: string
  salt: string
  avatar: string
  createdAt: number
}

interface LocalItemRow extends PendingItem {
  sortOrder: number
}

interface SessionPayload {
  v: number
  uid: number
}

interface SeqMeta {
  user: number
  item: number
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

export function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // 存储不可用时仅保留本次会话的登录态
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

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    // 手工改坏存储时按空数据处理
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new ApiError(507, '本地存储空间不足，修改未能保存')
  }
}

/** 会话失效：清 token → 通知 store → 抛 401 */
function failUnauthorized(message: string): never {
  setToken(null)
  unauthorizedHandler?.()
  throw new ApiError(401, message)
}

// ---------------------------------------------------------------------------
// 校验（语义与 server/items.ts、server/auth.ts 一致）
// ---------------------------------------------------------------------------

function validateTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  if (!title || title.length > MAX_TITLE) return null
  return title
}

/** 返回 null 表示不合法；缺省按空明细处理 */
function validateNotes(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > MAX_NOTES) return null
  return value
}

function validatePriority(value: unknown): Priority | null {
  return typeof value === 'string' && (PRIORITIES as string[]).includes(value)
    ? (value as Priority)
    : null
}

/** 返回 null 表示合法的“清除截止日期”，返回 undefined 表示不合法 */
function validateDueAt(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  return undefined
}

function validateTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const tags: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim()
    if (!tag || tag.length > MAX_TAG_LENGTH) continue
    if (!tags.includes(tag)) tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

/** 头像以 JSON {emoji,color} 存储；'' 表示未设置（前端按用户名派生默认头像） */
function validateAvatarStorage(value: unknown): string | null {
  if (value === '' || value === null || value === undefined) return ''
  if (typeof value !== 'object') return null
  const { emoji, color } = value as { emoji?: unknown; color?: unknown }
  if (typeof emoji !== 'string' || [...emoji].length < 1 || [...emoji].length > 4) return null
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return null
  return JSON.stringify({ emoji, color: color.toLowerCase() })
}

// ---------------------------------------------------------------------------
// 读档（容错）：坏掉的行丢弃或填默认值，不让单条脏数据拖垮整个应用
// ---------------------------------------------------------------------------

function toLocalUser(value: unknown): LocalUser | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'number' || !Number.isInteger(record.id)) return null
  if (typeof record.username !== 'string' || !record.username) return null
  return {
    id: record.id,
    username: record.username,
    passwordHash: typeof record.passwordHash === 'string' ? record.passwordHash : '',
    salt: typeof record.salt === 'string' ? record.salt : '',
    avatar: typeof record.avatar === 'string' ? record.avatar : '',
    createdAt: typeof record.createdAt === 'number' ? Math.floor(record.createdAt) : 0,
  }
}

function readUsers(): LocalUser[] {
  const raw = readJson<unknown[]>(USERS_KEY)
  if (!Array.isArray(raw)) return []
  return raw
    .map((value) => toLocalUser(value))
    .filter((value): value is LocalUser => value !== null)
}

function itemsKey(userId: number): string {
  return `${ITEMS_KEY_PREFIX}${userId}`
}

function toLocalItemRow(value: unknown, userId: number): LocalItemRow | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'number' || !Number.isInteger(record.id)) return null
  return {
    id: record.id,
    userId,
    title: typeof record.title === 'string' ? record.title : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
    done: record.done === true,
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? Math.floor(record.createdAt)
        : 0,
    doneAt: typeof record.doneAt === 'number' && Number.isFinite(record.doneAt)
      ? Math.floor(record.doneAt)
      : null,
    priority: validatePriority(record.priority) ?? 'medium',
    dueAt: validateDueAt(record.dueAt) ?? null,
    tags: validateTags(record.tags) ?? [],
    pinned: record.pinned === true,
    sortOrder: typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
      ? record.sortOrder
      : 0,
  }
}

function readItems(userId: number): LocalItemRow[] {
  const raw = readJson<unknown[]>(itemsKey(userId))
  if (!Array.isArray(raw)) return []
  return raw
    .map((value) => toLocalItemRow(value, userId))
    .filter((value): value is LocalItemRow => value !== null)
}

/** 与服务端 ORDER BY 一致：置顶 → sortOrder 升序 → id 倒序 */
function sortRows(rows: LocalItemRow[]): LocalItemRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return b.id - a.id
  })
}

function toItem(row: LocalItemRow): PendingItem {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    notes: row.notes,
    done: row.done,
    createdAt: row.createdAt,
    doneAt: row.doneAt,
    priority: row.priority,
    dueAt: row.dueAt,
    tags: [...row.tags],
    pinned: row.pinned,
  }
}

function toPublicUser(row: LocalUser): User {
  return { id: row.id, username: row.username, avatar: row.avatar }
}

// ---------------------------------------------------------------------------
// 会话与 id 高水位
// ---------------------------------------------------------------------------

function parseSession(raw: string | null): SessionPayload | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      value &&
      typeof value === 'object' &&
      (value as SessionPayload).v === SESSION_VERSION &&
      typeof (value as SessionPayload).uid === 'number' &&
      Number.isInteger((value as SessionPayload).uid) &&
      (value as SessionPayload).uid > 0
    ) {
      return value as SessionPayload
    }
  } catch {
    // 残留旧版 token（JWT 等）时无法解析，按未登录清理
  }
  return null
}

function sessionToken(userId: number): string {
  return JSON.stringify({ v: SESSION_VERSION, uid: userId } satisfies SessionPayload)
}

function requireUser(): LocalUser {
  const session = parseSession(getToken())
  if (!session) failUnauthorized('未登录')
  const user = readUsers().find((row) => row.id === session.uid)
  if (!user) failUnauthorized('登录状态无效或已过期')
  return user
}

/** 取自 seq 高水位；同时兼容没有 meta 但已有数据的旧档（把 id 顶到现有最大值之后） */
function nextId(kind: 'user' | 'item', existingIds: number[]): number {
  const meta = readJson<Partial<SeqMeta>>(SEQ_KEY) ?? {}
  const maxExisting = existingIds.length > 0 ? Math.max(...existingIds) : 0
  const next = Math.max(meta[kind] ?? 0, maxExisting) + 1
  const base: SeqMeta = { user: meta.user ?? 0, item: meta.item ?? 0 }
  const updated: SeqMeta = kind === 'user' ? { ...base, user: next } : { ...base, item: next }
  writeJson(SEQ_KEY, updated)
  return next
}

// ---------------------------------------------------------------------------
// 口令哈希：优先 Web Crypto SHA-256 + 随机盐；非安全上下文无 subtle 时退化为弱哈希
// ---------------------------------------------------------------------------

function randomSalt(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // 走后备
  }
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
}

function weakHash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    h1 = ((h1 << 5) - h1 + text.charCodeAt(i)) >>> 0
    h2 = ((h2 << 7) + h2 - text.charCodeAt(i)) >>> 0
  }
  return `weak:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}${text.length.toString(16)}`
}

async function hashPassword(password: string, salt: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`))
      return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    }
  } catch {
    // 无 subtle 时走弱哈希后备
  }
  return weakHash(`${salt}:${password}`)
}

// ---------------------------------------------------------------------------
// 对外接口（签名与原 REST 版一致）
// ---------------------------------------------------------------------------

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
  async register(username: string, password: string): Promise<{ token: string; user: User }> {
    const name = username.trim()
    if (name.length < 3 || name.length > 20) {
      throw new ApiError(400, '用户名需为 3-20 个字符')
    }
    if (password.length < 6) {
      throw new ApiError(400, '密码至少 6 位')
    }
    const salt = randomSalt()
    const passwordHash = await hashPassword(password, salt)
    // 哈希是异步过程，写入前重读用户表，避免并发注册被旧快照覆盖
    const users = readUsers()
    if (users.some((row) => row.username === name)) {
      throw new ApiError(409, '用户名已存在')
    }
    const user: LocalUser = {
      id: nextId('user', users.map((row) => row.id)),
      username: name,
      passwordHash,
      salt,
      avatar: '',
      createdAt: Date.now(),
    }
    writeJson(USERS_KEY, [...users, user])
    return { token: sessionToken(user.id), user: toPublicUser(user) }
  },

  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const name = username.trim()
    const row = readUsers().find((user) => user.username === name)
    if (row) {
      const passwordHash = await hashPassword(password, row.salt)
      if (row.passwordHash === passwordHash) {
        return { token: sessionToken(row.id), user: toPublicUser(row) }
      }
    }
    throw new ApiError(401, '用户名或密码错误')
  },

  async me(): Promise<{ user: User }> {
    return { user: toPublicUser(requireUser()) }
  },

  async updateAvatar(avatar: AvatarSpec | ''): Promise<{ user: User }> {
    const user = requireUser()
    const stored = validateAvatarStorage(avatar)
    if (stored === null) throw new ApiError(400, '头像数据不合法')
    const users = readUsers()
    const target = users.find((row) => row.id === user.id)
    if (!target) failUnauthorized('登录状态无效或已过期')
    target.avatar = stored
    writeJson(USERS_KEY, users)
    return { user: toPublicUser(target) }
  },

  async listItems(): Promise<{ items: PendingItem[] }> {
    const user = requireUser()
    return { items: sortRows(readItems(user.id)).map(toItem) }
  },

  async addItem(
    title: string,
    options: NewItemOptions = {},
  ): Promise<{ item: PendingItem }> {
    const user = requireUser()
    const cleanTitle = validateTitle(title)
    if (!cleanTitle) {
      throw new ApiError(400, `待办标题需为 1-${MAX_TITLE} 个字符`)
    }
    const notes = validateNotes(options.notes)
    if (notes === null) {
      throw new ApiError(400, `待办明细不能超过 ${MAX_NOTES} 字`)
    }
    const rows = readItems(user.id)
    const now = Date.now()
    const row: LocalItemRow = {
      id: nextId('item', rows.map((item) => item.id)),
      userId: user.id,
      title: cleanTitle,
      notes,
      done: false,
      createdAt: now,
      doneAt: null,
      priority: validatePriority(options.priority) ?? 'medium',
      dueAt: validateDueAt(options.dueAt) ?? null,
      tags: validateTags(options.tags) ?? [],
      pinned: false,
      sortOrder: -now, // 新条目排最前；置顶条目始终在列表头部
    }
    writeJson(itemsKey(user.id), [...rows, row])
    return { item: toItem(row) }
  },

  async updateItem(id: number, patch: ItemPatch): Promise<{ item: PendingItem }> {
    const user = requireUser()
    const rows = readItems(user.id)
    const row = rows.find((item) => item.id === id)
    if (!row) throw new ApiError(404, '条目不存在')

    const now = Date.now()
    const handled = (key: string): boolean => key in patch
    if (handled('done')) {
      if (typeof patch.done !== 'boolean') throw new ApiError(400, 'done 需为布尔值')
      row.done = patch.done
      row.doneAt = patch.done ? now : null
    }
    if (handled('title')) {
      const title = validateTitle(patch.title)
      if (!title) throw new ApiError(400, `待办标题需为 1-${MAX_TITLE} 个字符`)
      row.title = title
    }
    if (handled('notes')) {
      const notes = validateNotes(patch.notes)
      if (notes === null) throw new ApiError(400, `待办明细不能超过 ${MAX_NOTES} 字`)
      row.notes = notes
    }
    if (handled('priority')) {
      const priority = validatePriority(patch.priority)
      if (!priority) throw new ApiError(400, '优先级不合法')
      row.priority = priority
    }
    if (handled('dueAt')) {
      const dueAt = validateDueAt(patch.dueAt)
      if (dueAt === undefined) throw new ApiError(400, '截止日期不合法')
      row.dueAt = dueAt
    }
    if (handled('tags')) {
      const tags = validateTags(patch.tags)
      if (!tags) throw new ApiError(400, '标签需为字符串数组')
      row.tags = tags
    }
    if (handled('pinned')) {
      if (typeof patch.pinned !== 'boolean') throw new ApiError(400, 'pinned 需为布尔值')
      row.pinned = patch.pinned
    }
    if (
      !['done', 'title', 'notes', 'priority', 'dueAt', 'tags', 'pinned'].some(handled)
    ) {
      throw new ApiError(400, '缺少可更新字段')
    }

    writeJson(itemsKey(user.id), rows)
    return { item: toItem(row) }
  },

  async deleteItem(id: number): Promise<void> {
    const user = requireUser()
    const rows = readItems(user.id)
    const index = rows.findIndex((item) => item.id === id)
    if (index < 0) throw new ApiError(404, '条目不存在')
    rows.splice(index, 1)
    writeJson(itemsKey(user.id), rows)
  },

  async reorder(orderedIds: number[]): Promise<{ updated: number }> {
    const user = requireUser()
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      orderedIds.length > MAX_IMPORT ||
      orderedIds.some((value) => !Number.isInteger(value))
    ) {
      throw new ApiError(400, 'orderedIds 需为非空整数数组')
    }
    const rows = readItems(user.id)
    orderedIds.forEach((id, index) => {
      const row = rows.find((item) => item.id === id)
      if (row) row.sortOrder = index
    })
    writeJson(itemsKey(user.id), rows)
    return { updated: orderedIds.length }
  },

  async clearCompleted(): Promise<{ removed: number }> {
    const user = requireUser()
    const rows = readItems(user.id)
    const kept = rows.filter((item) => !item.done)
    writeJson(itemsKey(user.id), kept)
    return { removed: rows.length - kept.length }
  },

  async exportItems(): Promise<ExportPayload> {
    const user = requireUser()
    return {
      app: 'tiny-pending-item',
      version: 1,
      exportedAt: Date.now(),
      items: sortRows(readItems(user.id)).map(toItem),
    }
  },

  async importItems(rawList: unknown[]): Promise<ImportResult> {
    const user = requireUser()
    if (!Array.isArray(rawList)) {
      throw new ApiError(400, '导入数据需包含 items 数组')
    }
    if (rawList.length > MAX_IMPORT) {
      throw new ApiError(400, `单次最多导入 ${MAX_IMPORT} 条`)
    }
    const rows = readItems(user.id)
    let imported = 0
    let skipped = 0
    for (const raw of rawList) {
      const record = (raw ?? {}) as Record<string, unknown>
      const title = validateTitle(record.title)
      if (!title) {
        skipped++
        continue
      }
      const createdAt =
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) && record.createdAt > 0
          ? Math.floor(record.createdAt)
          : Date.now()
      const done = record.done === true
      const doneAt = done
        ? typeof record.doneAt === 'number' && Number.isFinite(record.doneAt) && record.doneAt > 0
          ? Math.floor(record.doneAt)
          : Date.now()
        : null
      rows.push({
        id: nextId('item', rows.map((item) => item.id)),
        userId: user.id,
        title,
        notes: validateNotes(record.notes) ?? '',
        done,
        createdAt,
        doneAt,
        priority: validatePriority(record.priority) ?? 'medium',
        dueAt: validateDueAt(record.dueAt) ?? null,
        tags: validateTags(record.tags) ?? [],
        pinned: record.pinned === true,
        sortOrder: -createdAt, // 保持原创建时间语义：按“创建时间倒序”融入列表
      })
      imported++
    }
    writeJson(itemsKey(user.id), rows)
    return { imported, skipped }
  },
}

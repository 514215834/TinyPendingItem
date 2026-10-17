import { Router } from 'express'
import type { DB } from './db.js'
import { PRIORITIES, type Item, type Priority } from './types.js'
import { getAuthedUserId } from './auth.js'

const MAX_TITLE = 50
const MAX_NOTES = 2000
const MAX_TAGS = 5
const MAX_TAG_LENGTH = 20
const MAX_IMPORT = 1000

interface ItemRow {
  id: number
  user_id: number
  title: string
  notes: string
  done: number
  created_at: number
  done_at: number | null
  priority: string
  due_at: number | null
  tags: string
  pinned: number
  sort_order: number
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    notes: row.notes ?? '',
    done: row.done !== 0,
    createdAt: row.created_at,
    doneAt: row.done_at,
    priority: (PRIORITIES as string[]).includes(row.priority) ? (row.priority as Priority) : 'medium',
    dueAt: row.due_at,
    tags: parseTags(row.tags),
    pinned: row.pinned !== 0,
  }
}

function parseTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((tag): tag is string => typeof tag === 'string')
  } catch {
    return []
  }
}

function validateTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.trim()
  if (!title || title.length > MAX_TITLE) return null
  return title
}

/** 返回 null 表示值不合法；缺省时按空明细处理 */
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

/** 返回 null 表示合法的“清除截止日期”，返回 undefined 表示值不合法 */
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

const SELECT_ITEM =
  'SELECT id, user_id, title, notes, done, created_at, done_at, priority, due_at, tags, pinned, sort_order FROM items'
const ORDER_BY = ' ORDER BY pinned DESC, sort_order ASC, id DESC'

export function itemsRouter(db: DB) {
  const router = Router()

  router.get('/', (req, res) => {
    const userId = getAuthedUserId(req)
    const rows = db
      .prepare(`${SELECT_ITEM} WHERE user_id = ?${ORDER_BY}`)
      .all(userId) as ItemRow[]
    res.json({ items: rows.map(toItem) })
  })

  router.post('/', (req, res) => {
    const userId = getAuthedUserId(req)
    const title = validateTitle(req.body?.title)
    if (!title) {
      res.status(400).json({ error: `待办标题需为 1-${MAX_TITLE} 个字符` })
      return
    }
    const priority = validatePriority(req.body?.priority) ?? 'medium'
    const dueAt = validateDueAt(req.body?.dueAt) ?? null
    const tags = validateTags(req.body?.tags) ?? []
    const notes = validateNotes(req.body?.notes)
    if (notes === null) {
      res.status(400).json({ error: `待办明细不能超过 ${MAX_NOTES} 字` })
      return
    }
    const now = Date.now()
    const info = db
      .prepare(
        'INSERT INTO items (user_id, title, notes, done, created_at, priority, due_at, tags, pinned, sort_order) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 0, ?)',
      )
      .run(userId, title, notes, now, priority, dueAt, JSON.stringify(tags), -now)
    const row = db.prepare(`${SELECT_ITEM} WHERE id = ?`).get(info.lastInsertRowid) as ItemRow
    res.status(201).json({ item: toItem(row) })
  })

  router.patch('/:id', (req, res) => {
    const userId = getAuthedUserId(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: '条目不存在' })
      return
    }
    const body: Record<string, unknown> = req.body ?? {}
    const sets: string[] = []
    const params: unknown[] = []
    const now = Date.now()

    if ('done' in body) {
      if (typeof body.done !== 'boolean') {
        res.status(400).json({ error: 'done 需为布尔值' })
        return
      }
      sets.push('done = ?', 'done_at = ?')
      params.push(body.done ? 1 : 0, body.done ? now : null)
    }
    if ('title' in body) {
      const title = validateTitle(body.title)
      if (!title) {
        res.status(400).json({ error: `待办标题需为 1-${MAX_TITLE} 个字符` })
        return
      }
      sets.push('title = ?')
      params.push(title)
    }
    if ('notes' in body) {
      const notes = validateNotes(body.notes)
      if (notes === null) {
        res.status(400).json({ error: `待办明细不能超过 ${MAX_NOTES} 字` })
        return
      }
      sets.push('notes = ?')
      params.push(notes)
    }
    if ('priority' in body) {
      const priority = validatePriority(body.priority)
      if (!priority) {
        res.status(400).json({ error: '优先级不合法' })
        return
      }
      sets.push('priority = ?')
      params.push(priority)
    }
    if ('dueAt' in body) {
      const dueAt = validateDueAt(body.dueAt)
      if (dueAt === undefined) {
        res.status(400).json({ error: '截止日期不合法' })
        return
      }
      sets.push('due_at = ?')
      params.push(dueAt)
    }
    if ('tags' in body) {
      const tags = validateTags(body.tags)
      if (!tags) {
        res.status(400).json({ error: '标签需为字符串数组' })
        return
      }
      sets.push('tags = ?')
      params.push(JSON.stringify(tags))
    }
    if ('pinned' in body) {
      if (typeof body.pinned !== 'boolean') {
        res.status(400).json({ error: 'pinned 需为布尔值' })
        return
      }
      sets.push('pinned = ?')
      params.push(body.pinned ? 1 : 0)
    }

    if (sets.length === 0) {
      res.status(400).json({ error: '缺少可更新字段' })
      return
    }
    params.push(id, userId)
    const info = db
      .prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...params)
    if (info.changes === 0) {
      res.status(404).json({ error: '条目不存在' })
      return
    }
    const row = db.prepare(`${SELECT_ITEM} WHERE id = ?`).get(id) as ItemRow
    res.json({ item: toItem(row) })
  })

  router.post('/reorder', (req, res) => {
    const userId = getAuthedUserId(req)
    const orderedIds: unknown = req.body?.orderedIds
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      orderedIds.length > MAX_IMPORT ||
      orderedIds.some((value) => !Number.isInteger(value))
    ) {
      res.status(400).json({ error: 'orderedIds 需为非空整数数组' })
      return
    }
    const update = db.prepare('UPDATE items SET sort_order = ? WHERE id = ? AND user_id = ?')
    db.transaction(() => {
      orderedIds.forEach((value: number, index: number) => {
        update.run(index, value, userId)
      })
    })()
    res.json({ updated: orderedIds.length })
  })

  router.post('/clear-completed', (req, res) => {
    const userId = getAuthedUserId(req)
    const info = db.prepare('DELETE FROM items WHERE user_id = ? AND done = 1').run(userId)
    res.json({ removed: info.changes })
  })

  router.get('/export', (req, res) => {
    const userId = getAuthedUserId(req)
    const rows = db
      .prepare(`${SELECT_ITEM} WHERE user_id = ?${ORDER_BY}`)
      .all(userId) as ItemRow[]
    res.json({
      app: 'tiny-pending-item',
      version: 1,
      exportedAt: Date.now(),
      items: rows.map(toItem),
    })
  })

  router.post('/import', (req, res) => {
    const userId = getAuthedUserId(req)
    const rawList: unknown = req.body?.items
    if (!Array.isArray(rawList)) {
      res.status(400).json({ error: '导入数据需包含 items 数组' })
      return
    }
    if (rawList.length > MAX_IMPORT) {
      res.status(400).json({ error: `单次最多导入 ${MAX_IMPORT} 条` })
      return
    }
    const insert = db.prepare(
      'INSERT INTO items (user_id, title, notes, done, created_at, done_at, priority, due_at, tags, pinned, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    let imported = 0
    let skipped = 0
    db.transaction(() => {
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
        const priority = validatePriority(record.priority) ?? 'medium'
        const dueAt = validateDueAt(record.dueAt) ?? null
        const tags = validateTags(record.tags) ?? []
        const notes = validateNotes(record.notes) ?? ''
        const pinned = record.pinned === true ? 1 : 0
        insert.run(
          userId,
          title,
          notes,
          done ? 1 : 0,
          createdAt,
          doneAt,
          priority,
          dueAt,
          JSON.stringify(tags),
          pinned,
          -createdAt,
        )
        imported++
      }
    })()
    res.json({ imported, skipped })
  })

  router.delete('/:id', (req, res) => {
    const userId = getAuthedUserId(req)
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: '条目不存在' })
      return
    }
    const info = db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(id, userId)
    if (info.changes === 0) {
      res.status(404).json({ error: '条目不存在' })
      return
    }
    res.status(204).end()
  })

  return router
}

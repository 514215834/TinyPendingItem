import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import type { DB } from './db.js'
import type { PublicUser } from './types.js'

const JWT_EXPIRES_IN = '7d'

export function getAuthedUserId(req: Request): number {
  return (req as unknown as { userId?: number }).userId ?? -1
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? '') as { uid?: unknown }
    if (typeof payload.uid !== 'number') {
      throw new Error('invalid payload')
    }
    ;(req as unknown as { userId: number }).userId = payload.uid
    next()
  } catch {
    res.status(401).json({ error: '登录状态无效或已过期' })
  }
}

function signToken(userId: number): string {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET ?? '', { expiresIn: JWT_EXPIRES_IN })
}

function toUser(row: { id: number; username: string; avatar?: string | null }): PublicUser {
  return { id: row.id, username: row.username, avatar: row.avatar ?? '' }
}

/** 头像以 JSON {emoji,color} 存储；'' 表示未设置（前端按用户名派生默认头像） */
function validateAvatar(value: unknown): string | null {
  if (value === '' || value === null || value === undefined) return ''
  if (typeof value !== 'object') return null
  const { emoji, color } = value as { emoji?: unknown; color?: unknown }
  if (typeof emoji !== 'string' || [...emoji].length < 1 || [...emoji].length > 4) return null
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return null
  return JSON.stringify({ emoji, color: color.toLowerCase() })
}

function readCredentials(req: Request): { username: string; password: string } {
  return {
    username: typeof req.body?.username === 'string' ? req.body.username.trim() : '',
    password: typeof req.body?.password === 'string' ? req.body.password : '',
  }
}

export function authRouter(db: DB) {
  const router = Router()

  router.post('/register', (req, res) => {
    const { username, password } = readCredentials(req)
    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ error: '用户名需为 3-20 个字符' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: '密码至少 6 位' })
      return
    }
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (exists) {
      res.status(409).json({ error: '用户名已存在' })
      return
    }
    const info = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), Date.now())
    const row = db
      .prepare('SELECT id, username, avatar FROM users WHERE id = ?')
      .get(info.lastInsertRowid) as { id: number; username: string; avatar: string }
    res.status(201).json({ token: signToken(row.id), user: toUser(row) })
  })

  router.post('/login', (req, res) => {
    const { username, password } = readCredentials(req)
    const row = db
      .prepare('SELECT id, username, password_hash, avatar FROM users WHERE username = ?')
      .get(username) as { id: number; username: string; password_hash: string; avatar: string } | undefined
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      res.status(401).json({ error: '用户名或密码错误' })
      return
    }
    res.json({ token: signToken(row.id), user: toUser(row) })
  })

  router.get('/me', requireAuth, (req, res) => {
    const userId = getAuthedUserId(req)
    const row = db
      .prepare('SELECT id, username, avatar FROM users WHERE id = ?')
      .get(userId) as { id: number; username: string; avatar: string } | undefined
    if (!row) {
      res.status(401).json({ error: '用户不存在' })
      return
    }
    res.json({ user: toUser(row) })
  })

  router.patch('/me', requireAuth, (req, res) => {
    const userId = getAuthedUserId(req)
    const avatar = validateAvatar(req.body?.avatar)
    if (avatar === null) {
      res.status(400).json({ error: '头像数据不合法' })
      return
    }
    const info = db
      .prepare('UPDATE users SET avatar = ? WHERE id = ?')
      .run(avatar, userId)
    if (info.changes === 0) {
      res.status(401).json({ error: '用户不存在' })
      return
    }
    const row = db
      .prepare('SELECT id, username, avatar FROM users WHERE id = ?')
      .get(userId) as { id: number; username: string; avatar: string }
    res.json({ user: toUser(row) })
  })

  return router
}

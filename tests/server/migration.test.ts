import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDb } from '../../server/db.js'

describe('旧库自动迁移（v0.1 → 迭代二/三）', () => {
  it('为旧 items 表补齐新列并回填 sort_order', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tiny-migration-'))
    try {
      const dbPath = path.join(dir, 'legacy.db')
      const legacy = new Database(dbPath)
      legacy.exec(`
        CREATE TABLE users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          username      TEXT    NOT NULL UNIQUE,
          password_hash TEXT    NOT NULL,
          created_at    INTEGER NOT NULL
        );
        CREATE TABLE items (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL REFERENCES users(id),
          title      TEXT    NOT NULL,
          done       INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          done_at    INTEGER
        );
      `)
      legacy
        .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run('legacy', 'x', 1)
      legacy
        .prepare('INSERT INTO items (user_id, title, done, created_at) VALUES (?, ?, 0, ?)')
        .run(1, '旧待办', 1600000000000)
      legacy.close()

      const db = createDb(dbPath)
      const columns = (db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>).map(
        (column) => column.name,
      )
      for (const name of ['notes', 'priority', 'due_at', 'tags', 'pinned', 'sort_order']) {
        expect(columns).toContain(name)
      }
      const userColumns = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(
        (column) => column.name,
      )
      expect(userColumns).toContain('avatar')
      const row = db.prepare('SELECT * FROM items WHERE title = ?').get('旧待办') as {
        sort_order: number
        priority: string
        tags: string
      }
      expect(row.sort_order).toBe(-1600000000000)
      expect(row.priority).toBe('medium')
      expect(row.tags).toBe('[]')
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

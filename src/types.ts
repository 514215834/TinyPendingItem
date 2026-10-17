export type Priority = 'high' | 'medium' | 'low'

export const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export interface User {
  id: number
  username: string
  avatar: string
}

export interface Domain {
  id: number
  name: string
  emoji: string
}

/** 内置域：新账号与旧档案首次访问时自动播种，顺序即展示顺序 */
export const DEFAULT_DOMAINS: ReadonlyArray<{ name: string; emoji: string }> = [
  { name: '工作', emoji: '💼' },
  { name: '生活', emoji: '🏠' },
  { name: '学习', emoji: '📚' },
]

/** 新建/编辑域时可选的图标 */
export const DOMAIN_EMOJIS: string[] = [
  '💼',
  '🏠',
  '📚',
  '🎯',
  '✈️',
  '🎮',
  '💡',
  '❤️',
  '🏃',
  '🎵',
  '🛒',
  '🌿',
  '⚙️',
  '📁',
]

export interface PendingItem {
  id: number
  userId: number
  domainId: number
  title: string
  notes: string
  done: boolean
  createdAt: number
  doneAt: number | null
  priority: Priority
  dueAt: number | null
  tags: string[]
  pinned: boolean
}

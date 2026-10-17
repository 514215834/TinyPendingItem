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

export interface PendingItem {
  id: number
  userId: number
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

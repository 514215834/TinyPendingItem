<script setup lang="ts">
import { onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { ArrowBackOutline, TrashOutline, TrashBinOutline } from '@vicons/ionicons5'
import { useItemsStore } from '../stores/items'
import { useDomainsStore } from '../stores/domains'
import type { PendingItem } from '../types'

const items = useItemsStore()
const domains = useDomainsStore()
const message = useMessage()

function domainOf(row: PendingItem): string {
  const found = domains.list.find((d) => d.id === row.domainId)
  return found ? `${found.emoji} ${found.name}` : '📁 未命名域'
}

function formatDeleted(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  // 打开即拉取并惰性清理超期条目
  items
    .loadTrash()
    .then(({ autoPurged }) => {
      if (autoPurged > 0) {
        message.info(`已自动清理 ${autoPurged} 条超过 30 天的回收站条目`)
      }
    })
    .catch((error: unknown) => {
      message.error(error instanceof Error ? error.message : '回收站加载失败，请稍后再试')
    })
})

async function restore(row: PendingItem): Promise<void> {
  try {
    await items.restoreFromTrash(row.id)
    message.success(`已恢复「${row.title}」`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '恢复失败，请稍后再试')
  }
}

async function purge(row: PendingItem): Promise<void> {
  try {
    await items.purgeFromTrash(row.id)
    message.success('已彻底删除')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败，请稍后再试')
  }
}

async function emptyAll(): Promise<void> {
  try {
    const purged = await items.emptyTrash()
    message.success(`已清空回收站（${purged} 条）`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '清空失败，请稍后再试')
  }
}
</script>

<template>
  <div class="todo-list trash-list">
    <div class="toolbar">
      <n-button size="small" quaternary @click="items.exitTrash()">
        <n-icon :component="ArrowBackOutline" />
        返回列表
      </n-button>
      <span class="trash-caption">条目保留 30 天，超期自动清除</span>
      <n-popconfirm
        placement="bottom-right"
        positive-text="清空"
        negative-text="取消"
        @positive-click="emptyAll"
      >
        <template #trigger>
          <n-button size="small" tertiary type="error" :disabled="items.trash.length === 0">
            <n-icon :component="TrashBinOutline" />
            清空回收站
          </n-button>
        </template>
        将永久删除回收站内全部 {{ items.trash.length }} 条条目，且不可恢复。
      </n-popconfirm>
    </div>

    <div class="list-scroll">
      <n-empty
        v-if="items.trash.length === 0"
        class="todo-empty"
        description="回收站是空的"
        :show-icon="false"
      />
      <TransitionGroup v-else name="list" tag="ul" class="todo-items">
        <li v-for="row in items.trash" :key="row.id" class="todo-item trash-item">
          <div class="item-main" :title="row.notes || undefined">
            <div class="title-row">
              <span class="title">{{ row.title }}</span>
            </div>
            <div class="meta">
              <span class="domain-chip">{{ domainOf(row) }}</span>
              <span v-if="row.done" class="trash-done-flag">已完成</span>
              <span class="time">删除于 {{ formatDeleted(row.deletedAt!) }}</span>
            </div>
          </div>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle size="tiny" type="primary" @click="restore(row)">
                <n-icon :component="ArrowBackOutline" />
              </n-button>
            </template>
            恢复到原位置
          </n-tooltip>
          <n-popconfirm placement="left" positive-text="彻底删除" negative-text="取消" @positive-click="purge(row)">
            <template #trigger>
              <n-button quaternary circle size="tiny" type="error">
                <n-icon :component="TrashOutline" />
              </n-button>
            </template>
            永久删除「{{ row.title }}」，且不可恢复。
          </n-popconfirm>
        </li>
      </TransitionGroup>
    </div>
  </div>
</template>

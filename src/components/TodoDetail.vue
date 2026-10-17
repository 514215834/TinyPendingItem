<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { CloseOutline, DocumentTextOutline } from '@vicons/ionicons5'
import { useItemsStore } from '../stores/items'
import { useDomainsStore } from '../stores/domains'
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '../types'

const items = useItemsStore()
const domains = useDomainsStore()
const message = useMessage()

const draft = reactive<{
  title: string
  notes: string
  domainId: number | null
  priority: Priority
  dueAt: number | null
  tags: string[]
}>({
  title: '',
  notes: '',
  domainId: null,
  priority: 'medium',
  dueAt: null,
  tags: [],
})

const priorityOptions = PRIORITIES.map((value) => ({ label: PRIORITY_LABELS[value], value }))

watch(
  () => items.selected?.id,
  () => {
    const sel = items.selected
    if (!sel) return
    draft.title = sel.title
    draft.notes = sel.notes
    draft.domainId = sel.domainId
    draft.priority = sel.priority
    draft.dueAt = sel.dueAt
    draft.tags = [...sel.tags]
  },
  { immediate: true },
)

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function save(): Promise<void> {
  const sel = items.selected
  if (!sel) return
  const title = draft.title.trim()
  if (!title) {
    message.warning('待办标题不能为空')
    return
  }
  if (title.length > 50) {
    message.warning('待办标题不能超过 50 个字符')
    return
  }
  try {
    await items.update(sel.id, {
      title,
      notes: draft.notes,
      domainId: draft.domainId ?? sel.domainId,
      priority: draft.priority,
      dueAt: draft.dueAt,
      tags: draft.tags,
    })
    message.success('明细已保存')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败，请稍后再试')
  }
}

async function removeItem(): Promise<void> {
  const sel = items.selected
  if (!sel) return
  try {
    await items.remove(sel.id)
    message.success('待办已删除')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败，请稍后再试')
  }
}
</script>

<template>
  <div class="detail-wrap">
    <template v-if="items.selected">
      <div class="drawer-backdrop" @click="items.closeDetail()"></div>
      <aside class="detail-panel">
      <header class="detail-head">
        <span class="detail-caption"><n-icon :component="DocumentTextOutline" />卡片明细</span>
        <n-tooltip>
          <template #trigger>
            <n-button quaternary circle size="tiny" @click="items.closeDetail()">
              <n-icon :component="CloseOutline" />
            </n-button>
          </template>
          关闭（Esc）
        </n-tooltip>
      </header>

      <div class="detail-body">
        <div>
          <label class="field-label">标题</label>
          <n-input
            v-model:value="draft.title"
            size="small"
            placeholder="待办标题"
            @keyup.enter="save"
          />
        </div>

        <div>
          <label class="field-label">明细内容</label>
          <n-input
            v-model:value="draft.notes"
            type="textarea"
            :autosize="{ minRows: 5, maxRows: 14 }"
            maxlength="2000"
            show-count
            placeholder="补充说明、链接、子步骤…"
          />
        </div>

        <div>
          <label class="field-label">域</label>
          <n-select
            v-model:value="draft.domainId"
            size="small"
            :options="domains.domainOptions"
            placeholder="选择域"
          />
        </div>

        <div class="field-grid">
          <div>
            <label class="field-label">优先级</label>
            <n-select v-model:value="draft.priority" size="small" :options="priorityOptions" />
          </div>
          <div>
            <label class="field-label">截止日期</label>
            <n-date-picker
              v-model:value="draft.dueAt"
              size="small"
              type="date"
              clearable
              placeholder="无"
            />
          </div>
        </div>

        <div>
          <label class="field-label">标签</label>
          <n-dynamic-tags v-model:value="draft.tags" size="small" :max="5" />
        </div>

        <div class="detail-toggles">
          <n-checkbox
            :checked="items.selected.done"
            @update:checked="items.toggle(items.selected.id)"
          >
            已完成
          </n-checkbox>
          <n-checkbox
            :checked="items.selected.pinned"
            @update:checked="items.togglePin(items.selected)"
          >
            置顶
          </n-checkbox>
        </div>

        <div class="detail-meta">
          <span>创建于 {{ formatTime(items.selected.createdAt) }}</span>
          <span v-if="items.selected.doneAt">
            完成于 {{ formatTime(items.selected.doneAt) }}
          </span>
        </div>
      </div>

      <footer class="detail-actions">
        <n-button type="primary" size="small" @click="save">保存明细</n-button>
        <n-button quaternary size="small" type="error" @click="removeItem">删除待办</n-button>
      </footer>
      </aside>
    </template>

    <aside v-else class="detail-panel detail-placeholder">
      <n-empty description="点击卡片查看明细" :show-icon="false" />
    </aside>
  </div>
</template>

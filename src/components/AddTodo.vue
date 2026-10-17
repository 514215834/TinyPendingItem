<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import { useItemsStore } from '../stores/items'
import { useDomainsStore } from '../stores/domains'
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '../types'

const items = useItemsStore()
const domains = useDomainsStore()
const message = useMessage()

const show = ref(false)
const submitting = ref(false)
const titleInput = ref<{ focus: () => void } | null>(null)

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

/** 默认归属：当前选中的域；在“全部域”下则取第一个域 */
function defaultDomainId(): number | null {
  if (domains.activeId !== null) return domains.activeId
  return domains.list[0]?.id ?? null
}

function resetDraft(): void {
  draft.title = ''
  draft.notes = ''
  draft.domainId = defaultDomainId()
  draft.priority = 'medium'
  draft.dueAt = null
  draft.tags = []
}

function open(): void {
  resetDraft()
  show.value = true
  window.setTimeout(() => titleInput.value?.focus(), 80)
}

async function submit(): Promise<void> {
  const title = draft.title.trim()
  if (!title) {
    message.warning('请填写待办标题')
    return
  }
  if (title.length > 50) {
    message.warning('待办标题不能超过 50 个字符')
    return
  }
  submitting.value = true
  try {
    await items.add(title, {
      domainId: draft.domainId ?? domains.list[0]?.id,
      priority: draft.priority,
      dueAt: draft.dueAt,
      tags: draft.tags,
      notes: draft.notes,
    })
    message.success('待办已添加')
    show.value = false
    resetDraft()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '添加失败，请稍后再试')
  } finally {
    submitting.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <button class="add-zone" type="button" @click="open">
    <n-icon :component="AddOutline" />
    添加待办
  </button>

  <n-modal
    v-model:show="show"
    preset="card"
    title="添加待办"
    class="add-dialog"
    :bordered="false"
    :style="{ width: '540px' }"
  >
    <div class="dialog-body">
      <div>
        <label class="field-label">标题</label>
        <n-input
          ref="titleInput"
          v-model:value="draft.title"
          placeholder="待办标题（1-50 字）"
          @keyup.enter="submit"
        />
      </div>

      <div>
        <label class="field-label">明细内容</label>
        <n-input
          v-model:value="draft.notes"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 10 }"
          maxlength="2000"
          show-count
          placeholder="补充说明、链接、子步骤…"
        />
      </div>

      <div class="field-grid">
        <div>
          <label class="field-label">域</label>
          <n-select
            v-model:value="draft.domainId"
            size="small"
            :options="domains.domainOptions"
            placeholder="选择域"
          />
        </div>
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
    </div>

    <template #footer>
      <div class="dialog-actions">
        <n-button quaternary @click="show = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="submit">添加</n-button>
      </div>
    </template>
  </n-modal>
</template>

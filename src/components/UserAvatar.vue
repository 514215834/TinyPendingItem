<script setup lang="ts">
import { computed } from 'vue'
import { resolveAvatar } from '../utils/avatar'
import type { User } from '../types'

const props = defineProps<{ user: User; size?: number }>()

const spec = computed(() => resolveAvatar(props.user))
const size = computed(() => props.size ?? 32)
</script>

<template>
  <span
    class="user-avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: spec.color,
      fontSize: `${Math.round(size * 0.52)}px`,
    }"
  >
    {{ spec.emoji }}
  </span>
</template>

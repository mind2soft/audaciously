<script setup lang="ts">
import { inject } from "vue";
import { timelineKey } from "../lib/provider-keys";
import type { TImeline } from "../lib/timeline";

const timeline = inject<TImeline>(timelineKey);

if (!timeline) {
  throw new Error("missing timeline");
}
</script>

<template>
  <div></div>
  <div>Timeline</div>
</template>

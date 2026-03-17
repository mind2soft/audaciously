<!-- EffectSplit — static info panel for the selected Split compound node. -->
<!-- No props needed: enable/remove are handled directly in EffectsPipeline.vue -->
<template>
  <div class="flex items-center gap-2 px-3 py-3 text-xs">
    <i class="iconify mdi--source-fork size-4 shrink-0 text-warning" aria-hidden="true" />
    <div class="flex flex-col gap-0.5">
      <span class="font-semibold text-warning">Split Audio</span>
      <span class="text-base-content/50 italic leading-snug">
        L and R channels are each processed through their own mono effect chain above.
      </span>
    </div>
  </div>
</template>

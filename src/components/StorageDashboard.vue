<script setup lang="ts">
import { inject, ref, computed, onMounted } from "vue";
import { storageKey } from "../lib/provider-keys";
import type {
  StorageService,
  StorageEstimateResult,
} from "../lib/storage/storage-service";
import { isStorageApiAvailable } from "../lib/storage/storage-quota";

const storage = inject<StorageService>(storageKey);
if (!storage) throw new Error("missing storage service");

// ─── State ──────────────────────────────────────────────────────────────────

const estimate = ref<StorageEstimateResult | null>(null);
const persistent = ref<boolean | null>(null);
const requesting = ref(false);
const apiAvailable = isStorageApiAvailable();

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Computed ───────────────────────────────────────────────────────────────

const percentage = computed(() => {
  if (!estimate.value || estimate.value.quota === 0) return 0;
  return Math.min(estimate.value.percentage, 100);
});

const progressColor = computed(() => {
  const pct = percentage.value;
  if (pct > 90) return "progress-error";
  if (pct > 70) return "progress-warning";
  return "progress-primary";
});

// ─── Actions ────────────────────────────────────────────────────────────────

const refresh = async () => {
  estimate.value = await storage.estimateStorage();

  if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
    persistent.value = await navigator.storage.persisted();
  }
};

const handleRequestPersistence = async () => {
  requesting.value = true;
  try {
    const granted = await storage.requestPersistence();
    persistent.value = granted;
  } finally {
    requesting.value = false;
  }
};

// ─── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(refresh);

defineExpose({ refresh });
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="text-sm font-semibold flex items-center gap-1.5">
      <i class="iconify mdi--harddisk size-4" />
      Storage
    </h3>

    <!-- API not available -->
    <div
      v-if="!apiAvailable"
      class="text-xs text-base-content/40 italic"
    >
      Storage estimation not available (requires HTTPS).
    </div>

    <!-- Loading -->
    <div v-else-if="!estimate" class="skeleton h-6 w-full" />

    <!-- Dashboard -->
    <template v-else>
      <!-- Progress bar -->
      <div class="flex flex-col gap-1">
        <progress
          class="progress w-full"
          :class="progressColor"
          :value="percentage"
          max="100"
        />
        <div class="flex items-center justify-between text-xs text-base-content/60">
          <span>{{ formatBytes(estimate.used) }} used</span>
          <span>{{ percentage.toFixed(1) }}%</span>
          <span>{{ formatBytes(estimate.quota) }} total</span>
        </div>
      </div>

      <!-- Available space -->
      <div class="text-xs text-base-content/50">
        {{ formatBytes(estimate.quota - estimate.used) }} available
      </div>

      <!-- Persistence status + button -->
      <div class="flex items-center gap-2 mt-1">
        <template v-if="persistent === true">
          <span class="badge badge-success badge-sm gap-1">
            <i class="iconify mdi--shield-check size-3" />
            Persistent
          </span>
          <span class="text-xs text-base-content/40">
            Data won't be evicted under storage pressure.
          </span>
        </template>
        <template v-else-if="persistent === false">
          <button
            class="btn btn-xs btn-outline gap-1"
            :disabled="requesting"
            @click="handleRequestPersistence"
          >
            <i
              class="iconify size-3"
              :class="requesting ? 'mdi--loading animate-spin' : 'mdi--shield-lock-outline'"
            />
            Request Persistent Storage
          </button>
          <span class="text-xs text-base-content/40">
            Prevents browser from evicting saved projects.
          </span>
        </template>
      </div>
    </template>
  </div>
</template>

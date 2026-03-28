<script setup lang="ts">
/**
 * EffectsPipeline — visual pipeline diagram + property panel for audio effects.
 *
 * Displays a horizontal chain: SOURCE → [effect] → [effect] → TARGET
 * Click a node to select it and show its properties below.
 * Click a connector to open an "Add Effect" dropdown at that position.
 *
 * SplitEffect renders as a compound node containing two sub-rows (L and R).
 * Sub-row connectors only allow mono-compatible effects.
 * Disabling a Split dims its sub-rows; enabling a sub-effect auto-enables Split.
 *
 * Props
 * ─────
 * effects      Ordered list of AudioEffect objects.
 * maxDuration  Optional: total audio duration (seconds) for fade effects.
 * sourceLabel  Label for the source node (e.g. "Piano", "Recorded").
 * sourceIcon   Iconify icon name for the source (e.g. "mdi--piano").
 *
 * Emits
 * ─────
 * update:effects  Full replacement array whenever the chain changes.
 *
 * Slots
 * ─────
 * source-properties  Content rendered in the properties panel when the
 *                    source node is selected.
 */

import { computed, onBeforeUnmount, ref } from "vue";
import {
  createBalanceEffect,
  createFadeInEffect,
  createFadeOutEffect,
  createGainEffect,
  createSplitEffect,
  createVolumeEffect,
} from "../../features/effects";
import type {
  AudioEffect,
  AudioEffectType,
  BalanceEffect,
  FadeInEffect,
  FadeOutEffect,
  GainEffect,
  SplitEffect,
  VolumeEffect,
} from "../../features/effects/types";
import EffectBalance from "./EffectBalance.vue";
import EffectFadeIn from "./EffectFadeIn.vue";
import EffectFadeOut from "./EffectFadeOut.vue";
import EffectGain from "./EffectGain.vue";
import EffectSplit from "./EffectSplit.vue";
import EffectVolume from "./EffectVolume.vue";

// ── Props & Emits ─────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    effects: AudioEffect[];
    maxDuration?: number;
    sourceLabel: string;
    sourceIcon?: string;
  }>(),
  {
    maxDuration: undefined,
    sourceIcon: undefined,
  },
);

const emit = defineEmits<{
  "update:effects": [effects: AudioEffect[]];
}>();

// ── Connector target type ─────────────────────────────────────────────────────

/**
 * Where an active connector lives:
 * - { row: "main"; index: number } — main pipeline connector
 * - { row: "L" | "R"; splitIndex: number; index: number } — sub-pipeline connector
 */
type ConnectorTarget =
  | { row: "main"; index: number }
  | { row: "L" | "R"; splitIndex: number; index: number };

// ── Effect location type ──────────────────────────────────────────────────────

type EffectContext =
  | { kind: "main"; index: number }
  | { kind: "sub"; splitIndex: number; channel: "L" | "R"; subIndex: number };

// ── Selection state ───────────────────────────────────────────────────────────

/** 'source' | 'target' | effect.id | null */
const selectedId = ref<string | null>("source");

/** Find where an effect lives by its ID. */
function findEffectContext(id: string): EffectContext | null {
  for (let i = 0; i < props.effects.length; i++) {
    const e = props.effects[i];
    if (e.id === id) return { kind: "main", index: i };
    if (e.type === "split") {
      const split = e as SplitEffect;
      const li = split.left.findIndex((s) => s.id === id);
      if (li !== -1) return { kind: "sub", splitIndex: i, channel: "L", subIndex: li };
      const ri = split.right.findIndex((s) => s.id === id);
      if (ri !== -1) return { kind: "sub", splitIndex: i, channel: "R", subIndex: ri };
    }
  }
  return null;
}

const selectedEffect = computed((): AudioEffect | null => {
  if (!selectedId.value) return null;
  const ctx = findEffectContext(selectedId.value);
  if (!ctx) return null;
  if (ctx.kind === "main") return props.effects[ctx.index];
  const split = props.effects[ctx.splitIndex] as SplitEffect;
  return (ctx.channel === "L" ? split.left : split.right)[ctx.subIndex];
});

function selectNode(id: string | null) {
  selectedId.value = id;
  activeConnector.value = null;
  dropdownPos.value = null;
}

// ── Connector / add-effect state ─────────────────────────────────────────────

const activeConnector = ref<ConnectorTarget | null>(null);
const dropdownPos = ref<{ top: number; left: number } | null>(null);

function isActiveConnector(target: ConnectorTarget): boolean {
  const a = activeConnector.value;
  if (!a) return false;
  if (a.row !== target.row) return false;
  if (a.row === "main" && target.row === "main") return a.index === target.index;
  if (a.row !== "main" && target.row !== "main") {
    return (
      (a as Extract<ConnectorTarget, { row: "L" | "R" }>).splitIndex ===
        (target as Extract<ConnectorTarget, { row: "L" | "R" }>).splitIndex &&
      a.index === target.index
    );
  }
  return false;
}

function toggleConnector(target: ConnectorTarget, evt: MouseEvent) {
  selectedId.value = null;
  if (isActiveConnector(target)) {
    activeConnector.value = null;
    dropdownPos.value = null;
  } else {
    activeConnector.value = target;
    const btn = evt.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    dropdownPos.value = {
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
    };
  }
}

function closeConnector() {
  activeConnector.value = null;
  dropdownPos.value = null;
}

function onScrollOrResize() {
  if (activeConnector.value !== null) closeConnector();
}
window.addEventListener("scroll", onScrollOrResize, true);
window.addEventListener("resize", onScrollOrResize);
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScrollOrResize, true);
  window.removeEventListener("resize", onScrollOrResize);
});

// ── Available items in the dropdown ──────────────────────────────────────────

type EffectMenuItem = {
  type: AudioEffectType;
  label: string;
  icon: string;
  disabled?: boolean;
};

const splitAlreadyPresent = computed(() => props.effects.some((e) => e.type === "split"));

const activeDropdownItems = computed((): EffectMenuItem[] => {
  const ac = activeConnector.value;
  if (!ac) return [];

  if (ac.row === "main") {
    // Stereo connector — all types, split disabled if already present
    return [
      { type: "fadeIn", label: "Fade In", icon: "mdi--chart-bell-curve-cumulative" },
      { type: "fadeOut", label: "Fade Out", icon: "mdi--chart-bell-curve" },
      { type: "volume", label: "Volume Automation", icon: "mdi--waveform" },
      { type: "gain", label: "Gain", icon: "mdi--volume-high" },
      { type: "balance", label: "Balance", icon: "mdi--pan-horizontal" },
      {
        type: "split",
        label: "Split Audio",
        icon: "mdi--source-fork",
        disabled: splitAlreadyPresent.value,
      },
    ];
  } else {
    // Mono sub-row — only mono-compatible effects
    return [
      { type: "fadeIn", label: "Fade In", icon: "mdi--chart-bell-curve-cumulative" },
      { type: "fadeOut", label: "Fade Out", icon: "mdi--chart-bell-curve" },
      { type: "volume", label: "Volume Automation", icon: "mdi--waveform" },
      { type: "gain", label: "Gain", icon: "mdi--volume-high" },
    ];
  }
});

// ── Factory helper ────────────────────────────────────────────────────────────

function createEffectOfType(type: AudioEffectType): AudioEffect {
  switch (type) {
    case "gain":
      return createGainEffect();
    case "balance":
      return createBalanceEffect();
    case "fadeIn":
      return createFadeInEffect();
    case "fadeOut":
      return createFadeOutEffect();
    case "split":
      return createSplitEffect();
    case "volume":
      return createVolumeEffect();
  }
}

// ── Add effect ────────────────────────────────────────────────────────────────

function addEffect(type: AudioEffectType) {
  const ac = activeConnector.value;
  closeConnector();
  if (!ac) return;

  if (ac.row === "main") {
    _addMainEffect(ac.index, type);
  } else {
    _addSplitSubEffect(ac.row, ac.splitIndex, ac.index, type);
  }
}

function _addMainEffect(connectorIndex: number, type: AudioEffectType) {
  const newEffect = createEffectOfType(type);
  const next = [...props.effects];
  next.splice(connectorIndex, 0, newEffect);
  emit("update:effects", next);
  selectNode(newEffect.id);
}

function _addSplitSubEffect(
  channel: "L" | "R",
  splitIndex: number,
  connectorIndex: number,
  type: AudioEffectType,
) {
  const split = props.effects[splitIndex] as SplitEffect;
  const newEffect = createEffectOfType(type);
  const subArr = channel === "L" ? [...split.left] : [...split.right];
  subArr.splice(connectorIndex, 0, newEffect);

  const updatedSplit: SplitEffect = {
    ...split,
    left: channel === "L" ? subArr : split.left,
    right: channel === "R" ? subArr : split.right,
  };

  const next = [...props.effects];
  next[splitIndex] = updatedSplit;
  emit("update:effects", next);
  selectNode(newEffect.id);
}

// ── Update effect ─────────────────────────────────────────────────────────────

function updateEffectById(id: string, updated: AudioEffect) {
  const ctx = findEffectContext(id);
  if (!ctx) return;

  if (ctx.kind === "main") {
    const next = [...props.effects];
    next[ctx.index] = updated;
    emit("update:effects", next);
  } else {
    const split = props.effects[ctx.splitIndex] as SplitEffect;
    const subArr = ctx.channel === "L" ? [...split.left] : [...split.right];
    subArr[ctx.subIndex] = updated;

    // Smart cascade: enabling a sub-effect auto-enables the parent split
    let updatedSplit: SplitEffect = {
      ...split,
      left: ctx.channel === "L" ? subArr : split.left,
      right: ctx.channel === "R" ? subArr : split.right,
    };
    if (updated.enabled && !split.enabled) {
      updatedSplit = { ...updatedSplit, enabled: true };
    }

    const next = [...props.effects];
    next[ctx.splitIndex] = updatedSplit;
    emit("update:effects", next);
  }
}

// ── Remove effect ─────────────────────────────────────────────────────────────

function removeEffectById(id: string) {
  const ctx = findEffectContext(id);
  if (!ctx) return;
  selectedId.value = null;

  if (ctx.kind === "main") {
    const next = [...props.effects];
    next.splice(ctx.index, 1);
    emit("update:effects", next);
  } else {
    const split = props.effects[ctx.splitIndex] as SplitEffect;
    const subArr = ctx.channel === "L" ? [...split.left] : [...split.right];
    subArr.splice(ctx.subIndex, 1);

    const updatedSplit: SplitEffect = {
      ...split,
      left: ctx.channel === "L" ? subArr : split.left,
      right: ctx.channel === "R" ? subArr : split.right,
    };

    const next = [...props.effects];
    next[ctx.splitIndex] = updatedSplit;
    emit("update:effects", next);
  }
}

function removeSplitNode(splitIdx: number) {
  selectedId.value = null;
  const next = [...props.effects];
  next.splice(splitIdx, 1);
  emit("update:effects", next);
}

function toggleSplitEnabled(splitIdx: number) {
  const split = props.effects[splitIdx] as SplitEffect;
  const next = [...props.effects];
  next[splitIdx] = { ...split, enabled: !split.enabled };
  emit("update:effects", next);
}

function toggleEffectEnabled(id: string) {
  const ctx = findEffectContext(id);
  if (!ctx) return;
  let effect: AudioEffect;
  if (ctx.kind === "main") {
    effect = props.effects[ctx.index];
  } else {
    const split = props.effects[ctx.splitIndex] as SplitEffect;
    effect = (ctx.channel === "L" ? split.left : split.right)[ctx.subIndex];
  }
  updateEffectById(id, { ...effect, enabled: !effect.enabled });
}

// ── Sub-pipeline accessor ─────────────────────────────────────────────────────

function getSplitChannel(effect: AudioEffect, ch: "L" | "R"): AudioEffect[] {
  return (effect as SplitEffect)[ch === "L" ? "left" : "right"];
}

// ── Label / icon helpers ──────────────────────────────────────────────────────

function effectLabel(effect: AudioEffect): string {
  switch (effect.type) {
    case "gain":
      return "Gain";
    case "balance":
      return "Balance";
    case "fadeIn":
      return "Fade In";
    case "fadeOut":
      return "Fade Out";
    case "split":
      return "Split";
    case "volume":
      return "Volume";
  }
}

function effectIcon(effect: AudioEffect): string {
  switch (effect.type) {
    case "gain":
      return "mdi--volume-high";
    case "balance":
      return "mdi--pan-horizontal";
    case "fadeIn":
      return "mdi--chart-bell-curve-cumulative";
    case "fadeOut":
      return "mdi--chart-bell-curve";
    case "split":
      return "mdi--source-fork";
    case "volume":
      return "mdi--waveform";
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- ═══════════════════════════════════════════════════════════════════════
         Pipeline diagram strip (horizontally scrollable)
    ════════════════════════════════════════════════════════════════════════ -->
    <div
      class="shrink-0 overflow-x-auto py-3 px-2 bg-base-300/60 border-b border-base-300/40"
    >
      <!-- ── Main row ───────────────────────────────────────────────────── -->
      <div class="flex items-center gap-0 min-w-max">
        <!-- SOURCE node — left endpoint pill -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-l-full rounded-r border text-xs font-medium cursor-pointer transition-colors shrink-0"
          :class="
            selectedId === 'source'
              ? 'bg-primary/20 border-primary text-primary ring-1 ring-primary'
              : 'bg-base-200 border-base-200 text-base-content/60 hover:border-base-content/30 hover:text-base-content/80'
          "
          @click="selectNode('source')"
        >
          <i
            v-if="sourceIcon"
            class="iconify size-3.5 shrink-0"
            :class="sourceIcon"
            aria-hidden="true"
          />
          <i
            v-else
            class="iconify mdi--music-note size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{{ sourceLabel }}</span>
        </button>

        <!-- Main-row: connector before each effect + the effect node itself -->
        <template v-for="(effect, index) in effects" :key="effect.id">
          <!-- Stereo connector before this effect -->
          <button
            class="relative flex items-center h-6 px-0.5 group transition-colors shrink-0"
            :class="
              isActiveConnector({ row: 'main', index })
                ? 'text-primary'
                : 'text-base-content/25 hover:text-base-content/60'
            "
            :title="`Add effect before ${effectLabel(effect)}`"
            @click="toggleConnector({ row: 'main', index }, $event)"
          >
            <!-- Double stereo wire -->
            <span class="relative flex flex-col gap-0.75">
              <span class="block w-5 h-[1.5px] bg-current rounded-full" />
              <span class="block w-5 h-[1.5px] bg-current rounded-full" />
            </span>
            <!-- SVG arrowhead -->
            <svg
              viewBox="0 0 6 10"
              class="w-2 h-3.25 shrink-0 fill-current -ml-px"
              aria-hidden="true"
            >
              <polygon points="0,1 5,5 0,9" />
            </svg>
            <!-- Hover + indicator (hidden when active) -->
            <span
              class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity"
              :class="
                isActiveConnector({ row: 'main', index })
                  ? 'opacity-0'
                  : 'opacity-0 group-hover:opacity-100'
              "
            >
              <span
                class="flex items-center justify-center w-4 h-4 rounded-full bg-(--color-primary) border border-(--color-primary) text-(--color-primary-content) text-[10px] leading-none"
                >+</span
              >
            </span>
          </button>

          <!-- ── Split compound node ──────────────────────────────────── -->
          <div
            v-if="effect.type === 'split'"
            class="flex flex-col rounded border border-warning/50 bg-warning/5 shrink-0 shadow-sm"
          >
            <!-- Header bar — acts as the title + controls row -->
            <div
              class="flex items-center gap-1 px-2 py-1 cursor-pointer select-none border-b border-warning/20 rounded-t transition-colors"
              :class="
                selectedId === effect.id
                  ? 'bg-primary/10'
                  : 'hover:bg-warning/10'
              "
              @click="selectNode(effect.id)"
            >
              <i
                class="iconify mdi--source-fork size-3 text-warning/80 shrink-0"
                aria-hidden="true"
              />
              <span
                class="textarea-xs font-semibold text-warning/90 tracking-wide"
                >SPLIT</span
              >
              <span class="flex-1" />
              <!-- Enable toggle -->
              <button
                class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0"
                :title="effect.enabled ? 'Disable split' : 'Enable split'"
                :aria-pressed="effect.enabled"
                @click.stop="toggleSplitEnabled(index)"
              >
                <i
                  :class="
                    effect.enabled
                      ? 'iconify mdi--toggle-switch text-success'
                      : 'iconify mdi--toggle-switch-off text-base-content/40'
                  "
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
              <!-- Remove -->
              <button
                class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0 text-base-content/40 hover:text-error"
                title="Remove split"
                @click.stop="removeSplitNode(index)"
              >
                <i class="iconify mdi--close size-3" aria-hidden="true" />
              </button>
            </div>

            <!-- Sub-rows (L and R) — equal-width, fill compound node width -->
            <!-- The outer div is NOT px-padded so labels reach the border edges -->
            <div
              class="flex flex-col transition-opacity py-1"
              :class="effect.enabled ? '' : 'opacity-40 pointer-events-none'"
            >
              <div
                v-for="ch in ['L', 'R'] as const"
                :key="ch"
                class="flex items-center"
              >
                <!-- LEFT channel label — flush with left border -->
                <span
                  class="text-[10px] font-semibold text-warning/70 px-1.5 shrink-0 select-none font-mono leading-none"
                  >{{ ch }}</span
                >

                <!-- Sub-effects with mono connectors (fixed-size, non-stretching) -->
                <template
                  v-for="(subEff, subIdx) in getSplitChannel(effect, ch)"
                  :key="subEff.id"
                >
                  <!-- Mono connector before sub-effect -->
                  <button
                    class="relative flex items-center h-5 px-0.5 shrink-0 group transition-colors"
                    :class="
                      isActiveConnector({
                        row: ch,
                        splitIndex: index,
                        index: subIdx,
                      })
                        ? 'text-primary'
                        : 'text-base-content/25 hover:text-base-content/60'
                    "
                    :title="`Add effect before ${effectLabel(subEff)}`"
                    @click="
                      toggleConnector(
                        { row: ch, splitIndex: index, index: subIdx },
                        $event,
                      )
                    "
                  >
                    <!-- Single mono wire -->
                    <span class="block w-4 h-px bg-current rounded-full" />
                    <!-- SVG arrowhead -->
                    <svg
                      viewBox="0 0 6 10"
                      class="w-1.5 h-2.75 shrink-0 fill-current -ml-px"
                      aria-hidden="true"
                    >
                      <polygon points="0,1 5,5 0,9" />
                    </svg>
                    <!-- Hover + indicator (hidden when active) -->
                    <span
                      class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity"
                      :class="
                        isActiveConnector({
                          row: ch,
                          splitIndex: index,
                          index: subIdx,
                        })
                          ? 'opacity-0'
                          : 'opacity-0 group-hover:opacity-100'
                      "
                    >
                      <span
                        class="flex items-center justify-center w-4 h-4 rounded-full bg-(--color-primary) border border-(--color-primary) text-(--color-primary-content) text-[10px] leading-none"
                        >+</span
                      >
                    </span>
                  </button>

                  <!-- Sub-effect node -->
                  <div
                    class="flex items-stretch rounded border text-xs transition-colors shrink-0"
                    :class="[
                      selectedId === subEff.id
                        ? 'bg-primary/20 border-primary text-primary ring-1 ring-primary'
                        : 'bg-base-300 border-base-300/60 text-base-content/70 hover:border-base-content/30',
                      !subEff.enabled ? 'opacity-50' : '',
                    ]"
                  >
                    <!-- Select area -->
                    <button
                      class="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer"
                      @click="selectNode(subEff.id)"
                    >
                      <i
                        class="iconify size-3 shrink-0"
                        :class="effectIcon(subEff)"
                        aria-hidden="true"
                      />
                      <span>{{ effectLabel(subEff) }}</span>
                    </button>
                    <!-- Enable toggle -->
                    <button
                      class="flex items-center px-0.5 shrink-0 border-l border-current/10 text-base-content/50 hover:text-base-content transition-colors"
                      :title="
                        subEff.enabled ? 'Disable effect' : 'Enable effect'
                      "
                      :aria-pressed="subEff.enabled"
                      @click.stop="toggleEffectEnabled(subEff.id)"
                    >
                      <i
                        :class="
                          subEff.enabled
                            ? 'iconify mdi--toggle-switch text-success'
                            : 'iconify mdi--toggle-switch-off text-base-content/30'
                        "
                        class="size-3.5"
                        aria-hidden="true"
                      />
                    </button>
                    <!-- Remove -->
                    <button
                      class="flex items-center px-0.5 shrink-0 border-l border-current/10 text-base-content/30 hover:text-error transition-colors"
                      title="Remove effect"
                      @click.stop="removeEffectById(subEff.id)"
                    >
                      <i class="iconify mdi--close size-3" aria-hidden="true" />
                    </button>
                  </div>
                </template>

                <!-- TRAILING mono connector — flex-1 so it stretches to equalise row widths -->
                <button
                  class="relative flex items-center h-5 min-w-4 flex-1 px-0.5 group transition-colors"
                  :class="
                    isActiveConnector({
                      row: ch,
                      splitIndex: index,
                      index: getSplitChannel(effect, ch).length,
                    })
                      ? 'text-primary'
                      : 'text-base-content/25 hover:text-base-content/60'
                  "
                  title="Add effect at end of channel"
                  @click="
                    toggleConnector(
                      {
                        row: ch,
                        splitIndex: index,
                        index: getSplitChannel(effect, ch).length,
                      },
                      $event,
                    )
                  "
                >
                  <!-- Solid line stretches with flex-1 -->
                  <span class="flex-1 h-px bg-current rounded-full" />
                  <!-- SVG arrowhead fixed at right end -->
                  <svg
                    viewBox="0 0 6 10"
                    class="w-1.5 h-2.75 shrink-0 fill-current -ml-px"
                    aria-hidden="true"
                  >
                    <polygon points="0,1 5,5 0,9" />
                  </svg>
                  <!-- Hover + indicator (hidden when active) -->
                  <span
                    class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity"
                    :class="
                      isActiveConnector({
                        row: ch,
                        splitIndex: index,
                        index: getSplitChannel(effect, ch).length,
                      })
                        ? 'opacity-0'
                        : 'opacity-0 group-hover:opacity-100'
                    "
                  >
                    <span
                      class="flex items-center justify-center w-4 h-4 rounded-full bg-(--color-primary) border border-(--color-primary) text-(--color-primary-content) text-[10px] leading-none"
                      >+</span
                    >
                  </span>
                </button>

                <!-- RIGHT channel label — flush with right border -->
                <span
                  class="text-[10px] font-semibold text-warning/70 px-1.5 shrink-0 select-none font-mono leading-none"
                  >{{ ch }}</span
                >
              </div>
            </div>
          </div>

          <!-- ── Regular effect node ──────────────────────────────────── -->
          <div
            v-else
            class="flex items-stretch rounded border text-xs transition-colors shrink-0"
            :class="[
              selectedId === effect.id
                ? 'bg-primary/20 border-primary text-primary ring-1 ring-primary'
                : 'bg-base-300 border-base-300/60 text-base-content/70 hover:border-base-content/30',
              !effect.enabled ? 'opacity-50' : '',
            ]"
          >
            <!-- Select area -->
            <button
              class="flex items-center gap-1 px-2 py-1 cursor-pointer"
              @click="selectNode(effect.id)"
            >
              <i
                class="iconify size-3 shrink-0"
                :class="effectIcon(effect)"
                aria-hidden="true"
              />
              <span>{{ effectLabel(effect) }}</span>
            </button>
            <!-- Enable toggle -->
            <button
              class="flex items-center px-0.5 shrink-0 border-l border-current/10 text-base-content/50 hover:text-base-content transition-colors"
              :title="effect.enabled ? 'Disable effect' : 'Enable effect'"
              :aria-pressed="effect.enabled"
              @click.stop="toggleEffectEnabled(effect.id)"
            >
              <i
                :class="
                  effect.enabled
                    ? 'iconify mdi--toggle-switch text-success'
                    : 'iconify mdi--toggle-switch-off text-base-content/30'
                "
                class="size-3.5"
                aria-hidden="true"
              />
            </button>
            <!-- Remove -->
            <button
              class="flex items-center px-0.5 shrink-0 border-l border-current/10 text-base-content/30 hover:text-error transition-colors"
              title="Remove effect"
              @click.stop="removeEffectById(effect.id)"
            >
              <i class="iconify mdi--close size-3" aria-hidden="true" />
            </button>
          </div>
        </template>

        <!-- Final stereo connector (before TARGET) -->
        <button
          class="relative flex items-center h-6 px-0.5 group transition-colors shrink-0"
          :class="
            isActiveConnector({ row: 'main', index: effects.length })
              ? 'text-primary'
              : 'text-base-content/25 hover:text-base-content/60'
          "
          title="Add effect before output"
          @click="
            toggleConnector({ row: 'main', index: effects.length }, $event)
          "
        >
          <!-- Double stereo wire -->
          <span class="relative flex flex-col gap-0.75">
            <span class="block w-5 h-[1.5px] bg-current rounded-full" />
            <span class="block w-5 h-[1.5px] bg-current rounded-full" />
          </span>
          <!-- SVG arrowhead -->
          <svg
            viewBox="0 0 6 10"
            class="w-2 h-3.25 shrink-0 fill-current -ml-px"
            aria-hidden="true"
          >
            <polygon points="0,1 5,5 0,9" />
          </svg>
          <!-- Hover + indicator (hidden when active) -->
          <span
            class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity"
            :class="
              isActiveConnector({ row: 'main', index: effects.length })
                ? 'opacity-0'
                : 'opacity-0 group-hover:opacity-100'
            "
          >
            <span
              class="flex items-center justify-center w-4 h-4 rounded-full bg-(--color-primary) border border-(--color-primary) text-(--color-primary-content) text-[10px] leading-none"
              >+</span
            >
          </span>
        </button>

        <!-- TARGET node — right endpoint pill -->
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-r-full rounded-l border text-xs font-medium cursor-pointer transition-colors shrink-0"
          :class="
            selectedId === 'target'
              ? 'bg-primary/20 border-primary text-primary ring-1 ring-primary'
              : 'bg-base-200 border-base-200 text-base-content/60 hover:border-base-content/30 hover:text-base-content/80'
          "
          @click="selectNode('target')"
        >
          <i
            class="iconify mdi--speaker size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>Output</span>
        </button>
      </div>
    </div>

    <!-- Click-away overlay to close open connector dropdown -->
    <div
      v-if="activeConnector !== null"
      class="fixed inset-0 z-40"
      aria-hidden="true"
      @click="closeConnector"
    />

    <!-- Teleported dropdown — rendered outside overflow-clipped ancestors -->
    <Teleport to="body">
      <div
        v-if="activeConnector !== null && dropdownPos"
        class="fixed z-50 bg-base-300 border border-base-300/60 rounded-md shadow-lg min-w-max"
        :style="{
          top: dropdownPos.top + 'px',
          left: dropdownPos.left + 'px',
          transform: 'translateX(-50%)',
        }"
        @click.stop
      >
        <ul class="menu menu-xs py-1">
          <li v-for="opt in activeDropdownItems" :key="opt.type">
            <button
              class="text-xs flex items-center gap-1.5"
              :class="opt.disabled ? 'opacity-40 cursor-not-allowed' : ''"
              :disabled="opt.disabled"
              @click="addEffect(opt.type)"
            >
              <i
                class="iconify size-3 shrink-0"
                :class="opt.icon"
                aria-hidden="true"
              />
              {{ opt.label }}
            </button>
          </li>
        </ul>
      </div>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════════════════
         Properties panel for the selected element
    ════════════════════════════════════════════════════════════════════════ -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- Source properties (slot) -->
      <slot v-if="selectedId === 'source'" name="source-properties" />

      <!-- Effect properties -->
      <template v-else-if="selectedEffect">
        <EffectGain
          v-if="selectedEffect.type === 'gain'"
          :effect="selectedEffect as GainEffect"
          @update:effect="updateEffectById(selectedEffect!.id, $event)"
        />
        <EffectBalance
          v-else-if="selectedEffect.type === 'balance'"
          :effect="selectedEffect as BalanceEffect"
          @update:effect="updateEffectById(selectedEffect!.id, $event)"
        />
        <EffectFadeIn
          v-else-if="selectedEffect.type === 'fadeIn'"
          :effect="selectedEffect as FadeInEffect"
          :maxDuration="maxDuration ?? 0"
          @update:effect="updateEffectById(selectedEffect!.id, $event)"
        />
        <EffectFadeOut
          v-else-if="selectedEffect.type === 'fadeOut'"
          :effect="selectedEffect as FadeOutEffect"
          :maxDuration="maxDuration ?? 0"
          @update:effect="updateEffectById(selectedEffect!.id, $event)"
        />
        <EffectSplit v-else-if="selectedEffect.type === 'split'" />
        <EffectVolume
          v-else-if="selectedEffect.type === 'volume'"
          :effect="selectedEffect as VolumeEffect"
          :duration="maxDuration"
          @update:effect="updateEffectById(selectedEffect!.id, $event)"
        />
      </template>

      <!-- Target / empty state -->
      <div
        v-else
        class="flex items-center justify-center h-full text-xs text-base-content/40 p-4 text-center"
      >
        <template v-if="selectedId === 'target'">
          Output — no editable properties
        </template>
        <template v-else> Click a node or connector to configure </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SequencePanel — timeline tracks area (left column of Row 3).
 *
 * Contains:
 *   - TimelineRuler (canvas ruler + seek)
 *   - ZoomControl (top-right corner)
 *   - Scrollable track list (TrackRow + SegmentBlock per segment)
 *   - [+ Add Track] button
 *
 * Drag & Drop protocol
 * ────────────────────
 * Nodes are dragged from NodeTree using HTML drag API; the node id is stored
 * in dataTransfer as plain text. Dropping onto a TrackRow calls addSegment
 * with the time derived from the drop x position relative to the track content.
 *
 * Store connections
 * ─────────────────
 * useSequenceStore  — tracks, segments, timeline effects
 * useTimelineStore  — ratio, offsetTime, scaleUp/Down
 * useNodesStore     — nodeMap (resolve segment nodeId → node)
 * usePlayerStore    — currentTime (ruler cursor)
 */

import { computed } from "vue";
import { useSequenceStore } from "../../stores/sequence";
import { useTimelineStore } from "../../stores/timeline";
import { useNodesStore } from "../../stores/nodes";
import { usePlayerStore } from "../../stores/player";
import { useSegmentDrag } from "../../composables/useSegmentDrag";
import TimelineRuler from "../controls/TimelineRuler.vue";
import ZoomControl from "../controls/ZoomControl.vue";
import TrackRow from "../controls/TrackRow.vue";
import SegmentBlock from "../controls/SegmentBlock.vue";
import ScrollArea from "../layout/ScrollArea.vue";

const sequence = useSequenceStore();
const timeline = useTimelineStore();
const nodes = useNodesStore();
const player = usePlayerStore();

// ── Pixels-per-second derived from timeline ratio ─────────────────────────────
// ratio from the store is "pixels per second" scaled by a base factor.
// The timeline engine stores px/s directly in ratio.
const pixelsPerSecond = computed(() => timeline.ratio);

// ── Segment drag composable ───────────────────────────────────────────────────
const drag = useSegmentDrag(pixelsPerSecond);

// ── Seek ──────────────────────────────────────────────────────────────────────
function onRulerSeek(time: number): void {
  player.seek(time);
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
const zoomRatio = computed({
  get: () => timeline.ratio,
  set: (v) => timeline.setRatio(v),
});

// ── Track actions ─────────────────────────────────────────────────────────────

function addTrack(): void {
  sequence.addTrack();
}

function onTrackResize(trackId: string, height: number): void {
  sequence.setTrackHeight(trackId, height);
}

function onTrackToggleMute(trackId: string): void {
  const track = sequence.tracks.find((t) => t.id === trackId);
  if (track) sequence.setTrackMuted(trackId, !track.muted);
}

function onTrackToggleLock(trackId: string): void {
  const track = sequence.tracks.find((t) => t.id === trackId);
  if (track) sequence.setTrackLocked(trackId, !track.locked);
}

// ── Drag & Drop: node → track  OR  track sort ────────────────────────────────

function onTrackDrop(trackId: string, event: DragEvent): void {
  // ── Track reorder drop ──────────────────────────────────────────────────
  const fromTrackId = event.dataTransfer?.getData(
    "application/x-audaciously-track-id",
  );
  if (fromTrackId) {
    const fromIndex = sequence.tracks.findIndex((t) => t.id === fromTrackId);
    const toIndex = sequence.tracks.findIndex((t) => t.id === trackId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      sequence.reorderTracks(fromIndex, toIndex);
    }
    return;
  }

  // ── Node → track drop ───────────────────────────────────────────────────
  const nodeId = event.dataTransfer?.getData("text/plain");
  if (!nodeId) return;

  const node = nodes.nodesById.get(nodeId);
  if (!node || node.kind === "folder") return;

  // event.currentTarget is the track content div (the element with @drop).
  // Use it directly to compute the drop position.
  const el = event.currentTarget as HTMLElement | null;
  const rect = el?.getBoundingClientRect();
  const relativeX = rect ? event.clientX - rect.left : 0;
  const time = Math.max(
    0,
    relativeX / pixelsPerSecond.value + timeline.offsetTime,
  );

  try {
    sequence.addSegment(trackId, nodeId, time);
  } catch {
    // Guard triggers for FolderNode — silently ignore (already checked above)
  }
}

// ── Segment interactions ──────────────────────────────────────────────────────

function onSegmentSelect(segmentId: string): void {
  sequence.selectSegment(segmentId);
}

// ── Resolve node for a segment ────────────────────────────────────────────────
function nodeForSegment(nodeId: string) {
  return nodes.nodesById.get(nodeId) ?? null;
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">
    <!-- ── Top bar: ruler + zoom ──────────────────────────────────────── -->
    <div
      class="flex items-center shrink-0 border-b border-base-300/60 bg-base-200"
    >
      <!-- 120px spacer aligns with track label area -->
      <div class="w-30 shrink-0" />

      <!-- Timeline Ruler -->
      <div class="flex-1 min-w-0">
        <TimelineRuler
          :durationSeconds="sequence.totalDuration"
          :offsetTime="timeline.offsetTime"
          :ratio="timeline.ratio"
          :currentTime="player.currentTime"
          @seek="onRulerSeek"
        />
      </div>

      <!-- Zoom control -->
      <div class="shrink-0 px-1 border-l border-base-300/60">
        <ZoomControl v-model="zoomRatio" />
      </div>
    </div>

    <!-- ── Track list (scrollable) ──────────────────────────────────────── -->
    <ScrollArea class="flex-1 min-h-0">
      <div class="flex flex-col min-w-0">
        <!-- Empty state when no tracks exist -->
        <div
          v-if="sequence.tracks.length === 0"
          class="flex flex-col items-center justify-center gap-2 py-16 text-base-content/30 text-sm select-none"
          aria-label="No tracks"
        >
          <i
            class="iconify mdi--music-note-plus size-12 mb-1 opacity-40"
            aria-hidden="true"
          />
          <p>No tracks yet</p>
          <p class="text-xs text-base-content/20">
            Click <strong class="text-base-content/40">Add Track</strong> below
            to get started
          </p>
        </div>

        <!-- Each track row -->
        <TrackRow
          v-for="track in sequence.tracks"
          :key="track.id"
          :track="track"
          @resize="onTrackResize(track.id, $event)"
          @toggle-mute="onTrackToggleMute(track.id)"
          @toggle-lock="onTrackToggleLock(track.id)"
          @drop="onTrackDrop(track.id, $event)"
        >
          <!-- Segments on this track -->
          <template v-for="seg in track.segments" :key="seg.id">
            <SegmentBlock
              v-if="nodeForSegment(seg.nodeId)"
              :segment="seg"
              :node="nodeForSegment(seg.nodeId)!"
              :pixelsPerSecond="pixelsPerSecond"
              @select="onSegmentSelect(seg.id)"
              @movestart="drag.startMoveDrag(seg.id, track.id, $event)"
              @trimstart-left="drag.startTrimStartDrag(seg.id, $event)"
              @trimstart-right="drag.startTrimEndDrag(seg.id, $event)"
            />
          </template>
        </TrackRow>

        <!-- [+ Add Track] button -->
        <div class="flex items-center px-3 py-2 border-t border-base-300/40">
          <button
            class="btn btn-xs btn-ghost gap-1 text-base-content/60"
            @click="addTrack"
          >
            <i class="iconify mdi--plus size-4" aria-hidden="true" />
            Add Track
          </button>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>

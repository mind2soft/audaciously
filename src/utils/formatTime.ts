export function formatTimeScale(seconds: number): string {
  const label = [];

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60 | 0;
  const ms = Math.floor((seconds % 1) * 1000);

  if (h > 0) {
    label.push(`${h}h`);
  }

  if (m > 0) {
    label.push(`${m}m`);
  }

  if (s > 0) {
    label.push(`${s}s`);
  }

  if (ms > 0) {
    label.push(`${ms}ms`);
  }

  return label.slice(0, 2).join(" ");
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) {
    return "--:--:--";
  }

  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60 | 0).padStart(2, "0");

  return `${h}:${m}:${s}`;
}

export const baseSecondWidthInPixels = 16;

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
    return "--:--";
  }

  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60 | 0).padStart(2, "0");
  const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, "0");

  if (seconds >= 3600) {
    const h = String(Math.floor(seconds / 3600));

    return `${h}:${m}:${s}.${ms}`;
  } else {
    return `${m}:${s}.${ms}`;
  }
}

export const formatTimeToPixel = (ratio: number, seconds: number) => {
  return ratio * seconds * baseSecondWidthInPixels;
};

export const formatPixelToTime = (ratio: number, px: number) => {
  return px / baseSecondWidthInPixels / ratio;
};

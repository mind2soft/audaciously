export function formatTime(seconds: number): string {
  const label = [];

  if (seconds >= 60) {
    let minutes = (seconds / 60) | 0;
    seconds = seconds - minutes * 60;

    if (minutes >= 60) {
      let hours = (minutes / 60) | 0;
      minutes = minutes - hours * 60;

      label.push(`${hours}h`);
    }

    if (minutes) {
      label.push(`${minutes}m`);
    }
  }

  let ms = Math.round(seconds * 1000) % 1000;

  seconds = seconds | 0;

  if (seconds || !(label.length || ms)) {
    label.push(`${seconds}s`);
  }

  if (ms) {
    label.push(`${ms}ms`);
  }

  return label.slice(0, 2).join(" ");
}

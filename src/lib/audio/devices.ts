export interface AudioDeviceList {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

/**
 * Enumerates all available audio input (microphone) and output (speaker)
 * devices.
 *
 * Browsers hide human-readable labels until the user has granted microphone
 * permission.  This function tries to obtain that permission by briefly
 * acquiring a media stream and immediately releasing it.  If permission is
 * denied the function still resolves; devices will simply have empty labels.
 */
export async function enumerateAudioDevices(): Promise<AudioDeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { inputs: [], outputs: [] };
  }

  // Briefly request the microphone so browsers unlock device labels.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Permission denied or unavailable — proceed with possibly unlabelled devices.
  }

  const all = await navigator.mediaDevices.enumerateDevices();

  return {
    inputs: all.filter((d) => d.kind === "audioinput"),
    outputs: all.filter((d) => d.kind === "audiooutput"),
  };
}

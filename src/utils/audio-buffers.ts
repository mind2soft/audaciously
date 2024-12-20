export type CreateAudioBufferOptions = {
  context?: AudioContext;
  numberOfChannels?: number;
  sampleRate?: number;
};

export function createAudioBuffer(
  duration: number,
  options?: CreateAudioBufferOptions
): AudioBuffer {
  const context =
    options?.context ?? new AudioContext({ sampleRate: options?.sampleRate });
  const sampleRate = options?.sampleRate ?? context.sampleRate;
  const numberOfChannels = options?.numberOfChannels ?? 1;

  const samples = duration * sampleRate;
  const buffer = context.createBuffer(numberOfChannels, samples, sampleRate);

  return buffer;
}

export async function getAudioBuffer(
  blobs: Blob[],
  sampleRate?: number
): Promise<AudioBuffer> {
  const context = new AudioContext({
    sampleRate,
  });

  const chunks = await Promise.all(
    blobs.map(async (blob) => {
      return context.decodeAudioData(await blob.arrayBuffer());
    })
  );

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const channelCount = chunks.reduce(
    (max, chunk) => Math.max(chunk.numberOfChannels, max),
    0
  );
  const buffer = context.createBuffer(
    channelCount,
    totalLength,
    context.sampleRate
  );
  let offset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    for (let channel = 0; channel < channelCount; channel++) {
      const channelData = chunk.getChannelData(channel);

      buffer.copyToChannel(channelData, channel, offset);
    }

    offset = offset + chunk.length;
  }

  return buffer;
}

export function resampleAudioBuffer(
  originalBuffer: AudioBuffer,
  targetSampleRate: number
): AudioBuffer {
  const numberOfChannels = originalBuffer.numberOfChannels;
  const length = originalBuffer.length;
  const context = new AudioContext({
    sampleRate: targetSampleRate,
  });

  const cloneBuffer = context.createBuffer(
    numberOfChannels,
    length,
    targetSampleRate
  );

  // Copy the source data into the offline AudioBuffer
  for (let channel = 0; channel < numberOfChannels; channel++) {
    cloneBuffer.copyToChannel(originalBuffer.getChannelData(channel), channel);
  }

  return cloneBuffer;
}

export function splitAudioBuffer(
  buffer: AudioBuffer,
  time: number
): [AudioBuffer | null, AudioBuffer | null] {
  const sampleRate = buffer.sampleRate;
  const leftLength = Math.floor(time * sampleRate);
  const rightLength = buffer.length - leftLength;
  const numberOfChannels = buffer.numberOfChannels;

  if (leftLength < 0.001) {
    return [null, buffer];
  } else if (rightLength < 0.001) {
    return [buffer, null];
  }

  const splitBuffers: [AudioBuffer, AudioBuffer] = [
    new AudioBuffer({
      length: leftLength,
      sampleRate,
      numberOfChannels,
    }),
    new AudioBuffer({
      length: rightLength,
      sampleRate,
      numberOfChannels,
    }),
  ];

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);

    const leftData = channelData.subarray(0, leftLength);
    const rightData = channelData.subarray(leftLength);

    splitBuffers[0].copyToChannel(leftData, channel);
    splitBuffers[1].copyToChannel(rightData, channel);
  }

  return splitBuffers;
}

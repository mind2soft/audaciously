const INITIAL_BUFFER_SIZE = 500000000;

class AudioBufferProcessor
  extends AudioWorkletProcessor
  implements AudioWorkletProcessorImpl
{
  // static get parameterDescriptors() {
  //   return [];
  // }

  buffer: Float32Array; // TODO: implement stereo buffer
  bufferHead: number = 0;
  totalSamples: number = 0;

  constructor() {
    super();

    this.buffer = new Float32Array(INITIAL_BUFFER_SIZE);

    // TODO: messages: write, read, seek, etc.
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const maxReads = this.totalSamples - this.bufferHead;

    if (maxReads < 1) return true;

    const outputCount = outputs.length;
    const channelCount = outputs.reduce(
      (channelCount, output) => Math.min(output.length, channelCount),
      outputs[0].length
    );

    const bufferReads = outputs.reduce(
      (minReads, output) => Math.min(output.length, minReads),
      maxReads
    );
    const samples = this.buffer.slice(this.bufferHead, bufferReads);

    for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) {
      const output = outputs[outputIndex];

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
        const channel = output[channelIndex];

        channel.set(samples, 0);
      }
    }

    this.bufferHead = this.bufferHead + bufferReads;

    return true;
  }
}

registerProcessor("audio-processor", AudioBufferProcessor);

export default null;

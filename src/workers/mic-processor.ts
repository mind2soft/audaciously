class MicrophoneProcessor
  extends AudioWorkletProcessor
  implements AudioWorkletProcessorImpl
{
  static get parameterDescriptors() {
    return [
      {
        name: "gain",
        defaultValue: 2,
        minValue: 0,
        maxValue: 3,
      },
    ];
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const sourceLimit = Math.min(inputs.length, outputs.length);
    const gain = parameters.gain;

    for (let inputNum = 0; inputNum < sourceLimit; inputNum++) {
      const input = inputs[inputNum];
      const output = outputs[inputNum];
      const channelCount = Math.min(input.length, output.length);

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
        const inputChannel = input[channelIndex];
        const outputChannel = output[channelIndex];
        const sampleCount = inputChannel.length;

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
          let sample = inputChannel[sampleIndex];
          // TODO: process params

          if (gain.length === 1) {
            sample = sample * gain[0];
          } else {
            sample = sample * gain[sampleIndex];
          }

          outputChannel[sampleIndex] = sample;
        }
      }
    }

    // console.log("procesing mic", inputs.length, outputs.length);

    return true;
  }
}

registerProcessor("mic-processor", MicrophoneProcessor);

export default null;

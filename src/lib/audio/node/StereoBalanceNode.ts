export type StereoBalanceOptions = {
  balance?: number;
};

export interface StereoBalanceNode extends AudioNode {
  readonly balance: AudioParam;
}

function clampBalanace(value: number) {
  return Math.max(Math.min(value, 1), -1);
}
function toLeft(value: number): number {
  return value > 0 ? 1 - value : 1;
}
function toRight(value: number): number {
  return value > 0 ? 1 : 1 + value;
}
function toBalance(left: number, right: number): number {
  if (left < 1) {
    return 1 - left;
  } else if (right < 1) {
    return right - 1;
  } else {
    return 0;
  }
}

// The Web Audio API does not offer an easy way to make a stereo balance
// control. This is an attempt to fill that void, using an API similar to
// [StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode)
export default function createStereoBalanceNode(
  context: AudioContext,
  options?: StereoBalanceOptions
): StereoBalanceNode {
  const defaultBalance = clampBalanace(options?.balance ?? 0);

  // ChannelSplitterNode cannot be told to use a `channelInterperatation` of
  // "speakers". This means that if we get a mono file, we will end up only
  // playing in the left speaker. So instead we use this dummy gain node to
  // convert whatever source we get (stereo, mono, or n channels) into a stereo
  // signal.
  // Idea credit: https://github.com/WebAudio/web-audio-api/issues/975#issue-177242377
  const upMixer = context.createGain();
  upMixer.channelCount = 2;
  upMixer.channelCountMode = "explicit";
  upMixer.channelInterpretation = "speakers";

  const splitter = context.createChannelSplitter(2);

  // Create the gains for left and right
  const leftGain = new GainNode(context, {
    gain: toLeft(defaultBalance),
    channelCount: 1,
  });
  const rightGain = new GainNode(context, {
    gain: toRight(defaultBalance),
    channelCount: 1,
  });

  const merger = context.createChannelMerger(2);

  upMixer.connect(splitter);

  splitter.connect(leftGain, 0);
  splitter.connect(rightGain, 1);

  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 1);

  // Create our own version of an [AudioParam](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam).
  // We don't currently support any of the "over time" methods, but maybe some day
  // we'll want to.
  const audioParam: AudioParam = {
    get automationRate() {
      return leftGain.gain.automationRate;
    },
    set automationRate(value) {
      leftGain.gain.automationRate = value;
      rightGain.gain.automationRate = value;
    },
    get defaultValue() {
      return defaultBalance;
    },
    get value() {
      return toBalance(leftGain.gain.value, rightGain.gain.value);
    },
    set value(value) {
      value = clampBalanace(value);
      leftGain.gain.value = toLeft(value);
      rightGain.gain.value = toRight(value);
    },
    get maxValue() {
      return 1;
    },
    get minValue() {
      return -1;
    },
    cancelAndHoldAtTime(cancelTime) {
      leftGain.gain.cancelAndHoldAtTime(cancelTime);
      rightGain.gain.cancelAndHoldAtTime(cancelTime);
      return audioParam;
    },
    cancelScheduledValues(cancelTime) {
      leftGain.gain.cancelScheduledValues(cancelTime);
      rightGain.gain.cancelScheduledValues(cancelTime);
      return audioParam;
    },
    setTargetAtTime(target, startTime, timeConstant) {
      target = clampBalanace(target);
      leftGain.gain.setTargetAtTime(toLeft(target), startTime, timeConstant);
      rightGain.gain.setTargetAtTime(toRight(target), startTime, timeConstant);
      return audioParam;
    },
    setValueAtTime(value, startTime) {
      value = clampBalanace(value);
      leftGain.gain.setValueAtTime(toLeft(value), startTime);
      rightGain.gain.setValueAtTime(toRight(value), startTime);
      return audioParam;
    },
    setValueCurveAtTime(values, startTime, duration) {
      const leftValues: number[] = [];
      const rightValues: number[] = [];
      for (let value of values) {
        value = clampBalanace(value);
        leftValues.push(toLeft(value));
        rightValues.push(toRight(value));
      }

      leftGain.gain.setValueCurveAtTime(leftValues, startTime, duration);
      rightGain.gain.setValueCurveAtTime(rightValues, startTime, duration);
      return audioParam;
    },
    exponentialRampToValueAtTime(value, endTime) {
      value = clampBalanace(value);
      leftGain.gain.exponentialRampToValueAtTime(toLeft(value), endTime);
      rightGain.gain.exponentialRampToValueAtTime(toRight(value), endTime);
      return audioParam;
    },
    linearRampToValueAtTime(value, endTime) {
      value = clampBalanace(value);
      leftGain.gain.linearRampToValueAtTime(toLeft(value), endTime);
      rightGain.gain.linearRampToValueAtTime(toRight(value), endTime);
      return audioParam;
    },
  };

  // The way the `.connect` API works, we can't actually construct our own
  // AudioNode. Instead we have to take an existing node and monkey patch it.
  Object.defineProperties(upMixer, {
    balance: {
      value: audioParam,
      enumerable: true,
      writable: false,
      configurable: true,
    },
    connect: {
      value: AudioNode.prototype.connect.bind(merger),
      enumerable: false,
      writable: false,
      configurable: true,
    },
    disconnect: {
      value: AudioNode.prototype.disconnect.bind(merger),
      enumerable: false,
      writable: false,
      configurable: true,
    },
  });

  return upMixer as any as StereoBalanceNode;
}

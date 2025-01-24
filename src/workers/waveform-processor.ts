/**
 * MIT License
 * Extracted from https://github.com/jerosoler/waveform-path
 */
/**
 * TODO: requesting the same id should cancel any undoing processing. Once
 *       this feature is implemented, then seqNum becomes obsolete.
 */

export type WaveformType = "linear"; // "polar"

export type WaveformMessage = {
  id: string;
  seqNum: number;
  type: WaveformType;
  framesData: Float32Array[];
  options?: LinearPathOptions;
};

export type WaveformResponse = {
  id: string;
  seqNum: number;
  path: string;
};

export interface Path {
  /**
   * Values 0 to 1
   * @default 0
   */
  minshow?: number;
  /**
   * Values 0 to 1
   * @default 1
   */
  maxshow?: number;
  /**
   * @default false
   */
  normalize?: boolean;
}

export interface LinearLineToPath extends Path {
  d: "L";
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

export interface HoritzontalPath extends Path {
  d: "H";
  sx: number;
  y: number;
  ex: number;
}

export interface VerticalPath extends Path {
  d: "V";
  sy: number;
  x: number;
  ey: number;
}

export interface LinearCubicBezierCurvePath extends Path {
  d: "C";
  sx: number;
  sy: number;
  x: number;
  y: number;
  ex: number;
  ey: number;
}

export interface LinearQuadraticBezierCurvePath extends Path {
  d: "Q";
  sx: number;
  sy: number;
  x: number;
  y: number;
  ex: number;
  ey: number;
}

export interface LinearArcPath extends Path {
  d: "A";
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  rx: number;
  ry: number;
  angle: number;
  arc: number;
  sweep: number;
}

export interface ClosePath extends Path {
  d: "Z";
}

export type LinearPath =
  | LinearLineToPath
  | HoritzontalPath
  | VerticalPath
  | LinearCubicBezierCurvePath
  | LinearQuadraticBezierCurvePath
  | LinearArcPath
  | ClosePath;

export interface LinearPathOptions {
  channel?: number;
  samples?: number;
  height?: number;
  width?: number;
  top?: number;
  left?: number;
  type?: "steps" | "mirror" | "bars";
  paths: LinearPath[];
  animation?: boolean;
  animationframes?: number;
  normalize?: boolean;
  start?: number;
  end?: number;
}

export const linearPath = (
  framesData: Float32Array[],
  options: LinearPathOptions
): string => {
  const {
    samples = framesData.length,
    height = 100,
    width = 800,
    top = 0,
    left = 0,
    type = "steps",
    paths = [{ d: "Q", sx: 0, sy: 0, x: 50, y: 100, ex: 100, ey: 0 }],
    normalize = true,
  } = options;

  const filteredData = getFilterData(framesData, samples);
  const normalizeData = normalize
    ? getNormalizeData(filteredData)
    : filteredData;

  let path = ``;

  const fixHeight = type != "bars" ? (height + top * 2) / 2 : height + top;
  const fixWidth = width / samples;
  const pathslength = paths.length;
  const fixpathslength = type == "mirror" ? pathslength * 2 : pathslength;

  const normalizeDataLength = normalizeData.length;

  for (let f = 0; f < normalizeDataLength; f++) {
    if (f > 0) {
      const pathlength = path.length;
      const lastvalue = path.charAt(pathlength - 1);
      if (lastvalue == ";" || pathlength === 0) {
        path += " M 0 0 ;";
      } else {
        path += ";";
      }
    }

    let last_pos_x = -9999;
    let last_pos_y = -9999;

    for (let i = 0; i < samples; i++) {
      const positive = type != "bars" ? (i % 2 ? 1 : -1) : 1;
      let mirror = 1;
      for (let j = 0; j < fixpathslength; j++) {
        let k = j;
        if (j >= pathslength) {
          k = j - pathslength;
          mirror = -1;
        }
        paths[k].minshow = paths[k].minshow ?? 0;
        paths[k].maxshow = paths[k].maxshow ?? 1;
        paths[k].normalize = paths[k].normalize ?? false;
        const normalizeDataValue = paths[k].normalize ? 1 : normalizeData[f][i];
        if (
          paths[k].minshow! <= normalizeData[f][i] &&
          paths[k].maxshow! >= normalizeData[f][i]
        ) {
          const curPath = paths[k];

          switch (curPath.d) {
            // LineTo Commands
            case "L": {
              const pos_x = i * fixWidth + (fixWidth * curPath.sx) / 100 + left;
              const pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.sy) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              //const end_pos_x = ((i+1) * fixWidth) - (fixWidth*(1-(curPath.ex/100))) + left;
              const end_pos_x =
                i * fixWidth + (fixWidth * curPath.ex) / 100 + left;
              const end_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.ey) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }

              path += `L ${end_pos_x} ${end_pos_y} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            case "H": {
              const pos_x = i * fixWidth + (fixWidth * curPath.sx) / 100 + left;
              const pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.y) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              //const end_pos_x = ((i+1) * fixWidth) - (fixWidth*(1-(curPath.ex/100))) + left;
              const end_pos_x =
                i * fixWidth + (fixWidth * curPath.ex) / 100 + left;
              const end_pos_y = pos_y;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }

              path += `H ${end_pos_x} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            case "V": {
              const pos_x = i * fixWidth + (fixWidth * curPath.x) / 100 + left;
              const pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.sy) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              const end_pos_x = pos_x;
              const end_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.ey) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }

              path += `V ${end_pos_y} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            // Cubic Bézier Curve Commands
            case "C": {
              const pos_x = i * fixWidth + (fixWidth * curPath.sx) / 100 + left;
              const pos_y =
                fixHeight - ((fixHeight * curPath.sy) / 100) * positive;

              const center_pos_x =
                i * fixWidth + (fixWidth * curPath.x) / 100 + left;
              const center_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.y) / 100) *
                  (type != "bars" ? height : height * 2) *
                  -positive *
                  mirror;

              //const end_pos_x = ((i+1) * fixWidth) - (fixWidth*(1-(curPath.ex/100))) + left;
              const end_pos_x =
                i * fixWidth + (fixWidth * curPath.ex) / 100 + left;
              const end_pos_y =
                fixHeight - ((fixHeight * curPath.ey) / 100) * positive;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }

              path += `C ${pos_x} ${pos_y} ${center_pos_x} ${center_pos_y} ${end_pos_x} ${end_pos_y} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            // Quadratic Bézier Curve Commands
            case "Q": {
              const pos_x = i * fixWidth + (fixWidth * curPath.sx) / 100 + left;
              const pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.sy) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              const center_pos_x =
                i * fixWidth + (fixWidth * curPath.x) / 100 + left;
              const center_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.y) / 100) *
                  (type != "bars" ? height : height * 2) *
                  -positive *
                  mirror;

              //const end_pos_x = ((i+1) * fixWidth) - (fixWidth*(1-(curPath.ex/100))) + left;
              const end_pos_x =
                i * fixWidth + (fixWidth * curPath.ex) / 100 + left;
              const end_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.ey) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }

              path += `Q ${center_pos_x} ${center_pos_y} ${end_pos_x} ${end_pos_y} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            // Elliptical Arc Curve Commands
            case "A": {
              const pos_x = i * fixWidth + (fixWidth * curPath.sx) / 100 + left;
              const pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.sy) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              //const end_pos_x = ((i+1) * fixWidth) - (fixWidth*(1-(curPath.ex/100))) + left;
              const end_pos_x =
                i * fixWidth + (fixWidth * curPath.ex) / 100 + left;
              const end_pos_y =
                fixHeight +
                ((normalizeDataValue * curPath.ey) / 100) *
                  (type != "bars" ? height / 2 : height) *
                  -positive *
                  mirror;

              if (pos_x !== last_pos_x || pos_y !== last_pos_y) {
                path += `M ${pos_x} ${pos_y} `;
              }
              const rx = (curPath.rx * fixWidth) / 100;
              const ry = (curPath.ry * fixWidth) / 100;
              let sweep = curPath.sweep;
              if (positive == -1) {
                if (sweep == 1) {
                  sweep = 0;
                } else {
                  sweep = 1;
                }
              }
              if (mirror == -1) {
                if (sweep == 1) {
                  sweep = 0;
                } else {
                  sweep = 1;
                }
              }
              path += `A ${rx} ${ry} ${curPath.angle} ${curPath.arc} ${sweep} ${end_pos_x} ${end_pos_y} `;

              last_pos_x = end_pos_x;
              last_pos_y = end_pos_y;
              break;
            }

            // ClosePath Commands
            case "Z":
              path += "Z ";
              break;

            default:
              break;
          }
        }
      }
    }
  }
  return path;
};

const getFilterData = (framesData: Float32Array[], samples: number) => {
  const filteredData: number[][] = [];
  const framesDataLength = framesData.length;
  for (let f = 0; f < framesDataLength; f++) {
    const blockSize = Math.floor(framesData[f].length / samples) as number; // the number of samples in each subdivision
    const filteredDataBlock: number[] = [];
    for (let i = 0; i < samples; i++) {
      let blockStart = blockSize * i; // the location of the first sample in the block
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum = sum + Math.abs(framesData[f][blockStart + j]); // find the sum of all the samples in the block
      }
      filteredDataBlock.push(sum / blockSize); // divide the sum by the block size to get the average
    }
    filteredData.push(filteredDataBlock);
  }
  return filteredData;
};

const getNormalizeData = (filteredData: number[][]) => {
  const multipliers: number[] = [];
  const filteredDataLength = filteredData.length;
  for (let i = 0; i < filteredDataLength; i++) {
    const multiplier = Math.max(...filteredData[i]);
    multipliers.push(multiplier);
  }
  const maxMultiplier = Math.pow(Math.max(...multipliers), -1);

  const normalizeData: number[][] = [];
  for (let i = 0; i < filteredDataLength; i++) {
    const normalizeDataBlock = filteredData[i].map((n) => n * maxMultiplier);
    normalizeData.push(normalizeDataBlock);
  }
  return normalizeData;
};

self.addEventListener("message", (e: any) => {
  const data = e.data as WaveformMessage;

  if (data.type === "linear") {
    const path = linearPath(
      data.framesData,
      data.options || ({} as LinearPathOptions)
    );

    postMessage({
      id: data.id,
      seqNum: data.seqNum,
      path,
    } satisfies WaveformResponse);
  }
});

export default null;

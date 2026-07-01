import { inflateSync } from "node:zlib";

function paethPredictor(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

export function decodePngScreenshot(buffer) {
  const signature = "89504e470d0a1a0a";
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Screenshot is not a PNG buffer.");
  }

  let offset = 8;
  let ihdr = null;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      ihdr = {
        bitDepth: data[8],
        colorType: data[9],
        compressionMethod: data[10],
        filterMethod: data[11],
        height: data.readUInt32BE(4),
        interlaceMethod: data[12],
        width: data.readUInt32BE(0),
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!ihdr) {
    throw new Error("Screenshot PNG is missing IHDR.");
  }
  if (ihdr.bitDepth !== 8 || ![2, 6].includes(ihdr.colorType)) {
    throw new Error(
      `Unsupported screenshot PNG format: bit depth ${ihdr.bitDepth}, color type ${ihdr.colorType}.`,
    );
  }
  if (ihdr.compressionMethod !== 0 || ihdr.filterMethod !== 0 || ihdr.interlaceMethod !== 0) {
    throw new Error("Unsupported screenshot PNG compression, filter, or interlace mode.");
  }

  const channels = ihdr.colorType === 6 ? 4 : 3;
  const rowLength = ihdr.width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(ihdr.width * ihdr.height * 4);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let y = 0; y < ihdr.height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= channels ? previousRow[x - channels] : 0;
      let value = raw;

      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = raw + paethPredictor(left, up, upLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG row filter ${filter}.`);
      }

      row[x] = value & 0xff;
    }
    sourceOffset += rowLength;

    for (let x = 0; x < ihdr.width; x += 1) {
      const rowIndex = x * channels;
      const pixelIndex = (y * ihdr.width + x) * 4;
      pixels[pixelIndex] = row[rowIndex];
      pixels[pixelIndex + 1] = row[rowIndex + 1];
      pixels[pixelIndex + 2] = row[rowIndex + 2];
      pixels[pixelIndex + 3] = channels === 4 ? row[rowIndex + 3] : 255;
    }

    previousRow = row;
  }

  return {
    height: ihdr.height,
    pixels,
    width: ihdr.width,
  };
}

function pixelAt(image, x, y) {
  const safeX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (safeY * image.width + safeX) * 4;
  return {
    b: image.pixels[index + 2],
    g: image.pixels[index + 1],
    r: image.pixels[index],
  };
}

function luminance(pixel) {
  return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
}

function saturation(pixel) {
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  return max <= 0 ? 0 : (max - min) / max;
}

function summarizeSampleBoxes(image, sampleBoxes = []) {
  let colorful = 0;
  let sampled = 0;
  let visible = 0;
  let saturationSum = 0;

  for (const box of sampleBoxes.slice(0, 80)) {
    const width = Number(box.width);
    const height = Number(box.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }
    const pixel = pixelAt(image, Number(box.left) + width / 2, Number(box.top) + height / 2);
    const sampleSaturation = saturation(pixel);
    const sampleLuma = luminance(pixel);
    sampled += 1;
    saturationSum += sampleSaturation;
    if (sampleLuma > 12 && sampleLuma < 245) {
      visible += 1;
    }
    if (sampleSaturation >= 0.14 && sampleLuma > 18) {
      colorful += 1;
    }
  }

  return {
    averageSaturation: sampled > 0 ? saturationSum / sampled : 0,
    colorful,
    total: sampled,
    visible,
  };
}

export function summarizeScreenshotPixels(image, sampleBoxes = []) {
  const totalPixels = image.width * image.height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 120_000)));
  const buckets = new Set();
  let edgeDeltaSum = 0;
  let edgeSamples = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let samples = 0;
  let saturatedPixels = 0;

  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const pixel = pixelAt(image, x, y);
      const luma = luminance(pixel);
      const bucket = ((pixel.r >> 4) << 8) | ((pixel.g >> 4) << 4) | (pixel.b >> 4);
      buckets.add(bucket);
      lumaSum += luma;
      lumaSquareSum += luma * luma;
      samples += 1;
      if (saturation(pixel) >= 0.18 && luma > 16) {
        saturatedPixels += 1;
      }
      if (x + step < image.width) {
        edgeDeltaSum += Math.abs(luma - luminance(pixelAt(image, x + step, y)));
        edgeSamples += 1;
      }
      if (y + step < image.height) {
        edgeDeltaSum += Math.abs(luma - luminance(pixelAt(image, x, y + step)));
        edgeSamples += 1;
      }
    }
  }

  const lumaMean = samples > 0 ? lumaSum / samples : 0;
  const variance = samples > 0 ? lumaSquareSum / samples - lumaMean * lumaMean : 0;

  return {
    colorBuckets: buckets.size,
    edgeDeltaMean: edgeSamples > 0 ? edgeDeltaSum / edgeSamples : 0,
    height: image.height,
    lumaMean,
    lumaStdDev: Math.sqrt(Math.max(0, variance)),
    saturatedPixelRatio: samples > 0 ? saturatedPixels / samples : 0,
    samples,
    swatchSamples: summarizeSampleBoxes(image, sampleBoxes),
    width: image.width,
  };
}

export function measureScreenshotPixels(buffer, sampleBoxes = []) {
  return summarizeScreenshotPixels(decodePngScreenshot(buffer), sampleBoxes);
}

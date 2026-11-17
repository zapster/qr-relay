import QRCode from '../vendor/qrcode.js';

const jsQR = globalThis.jsQR;

/**
 * Decode QR payload bytes without interpreting the QR's text representation.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @returns {Uint8Array|null}
 */
export function decodeQr(imageData) {
  if (
    !imageData
    || !(imageData.data instanceof Uint8ClampedArray)
    || !Number.isInteger(imageData.width)
    || !Number.isInteger(imageData.height)
    || imageData.width <= 0
    || imageData.height <= 0
    || imageData.data.length !== imageData.width * imageData.height * 4
  ) {
    throw new TypeError('Expected RGBA image data with positive integer dimensions.');
  }

  const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (decoded === null) {
    return null;
  }
  if (!Array.isArray(decoded.binaryData)) {
    throw new Error('QR decoder did not provide binary payload bytes.');
  }
  return Uint8Array.from(decoded.binaryData);
}

/**
 * Encode bytes as an opaque black-and-white QR image and verify the raster by
 * decoding it again. QR encoding metadata is not copied from any source QR.
 *
 * @param {Uint8Array} bytes
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function buildVerifiedQr(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('QR payload must be a Uint8Array.');
  }

  let qr;
  try {
    qr = QRCode.create(
      [{ data: Uint8ClampedArray.from(bytes), mode: 'byte' }],
      { errorCorrectionLevel: 'L' },
    );
  } catch {
    throw new Error('QR payload exceeds byte-mode capacity or could not be encoded.');
  }

  const quietZone = 4;
  const pixelsPerModule = 12;
  const matrixSize = qr.modules.size;
  const width = (matrixSize + quietZone * 2) * pixelsPerModule;
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);

  for (let row = 0; row < matrixSize; row += 1) {
    for (let column = 0; column < matrixSize; column += 1) {
      if (!qr.modules.get(row, column)) {
        continue;
      }
      const pixelLeft = (column + quietZone) * pixelsPerModule;
      const pixelTop = (row + quietZone) * pixelsPerModule;
      for (let y = pixelTop; y < pixelTop + pixelsPerModule; y += 1) {
        let pixel = (y * width + pixelLeft) * 4;
        for (let x = 0; x < pixelsPerModule; x += 1) {
          data[pixel] = 0;
          data[pixel + 1] = 0;
          data[pixel + 2] = 0;
          pixel += 4;
        }
      }
    }
  }

  let verified;
  try {
    verified = decodeQr({ data, width, height });
  } catch {
    throw new Error('Generated QR image could not be decoded for byte verification.');
  }
  if (verified === null) {
    throw new Error('Generated QR image could not be found during byte verification.');
  }
  if (!equalBytes(bytes, verified)) {
    throw new Error('Generated QR image failed exact payload-byte verification.');
  }
  return { data, width, height };
}

function equalBytes(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

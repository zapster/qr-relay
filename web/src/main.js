import { decodeQr, buildVerifiedQr } from './qr-codec.js';
import { createCamera } from './camera.js';

const video = document.querySelector('#camera-preview');
const preview = document.querySelector('#preview-shell');
const selector = document.querySelector('#camera-select');
const selectorLabel = document.querySelector('#camera-label');
const enableButton = document.querySelector('#enable-camera');
const cancelButton = document.querySelector('#cancel-scan');
const resetButton = document.querySelector('#reset');
const status = document.querySelector('#status');
const resultCanvas = document.querySelector('#qr-result');
const captureCanvas = document.createElement('canvas');
const captureContext = captureCanvas.getContext('2d', { willReadFrequently: true });
const camera = createCamera(video, { onEnded: handleCameraEnded });

let session = 0;
let frameTimer = 0;
let scanning = false;
let preparing = false;

function cameraAvailable() {
  const mediaDevices = navigator.mediaDevices;
  return window.isSecureContext
    && typeof mediaDevices?.getUserMedia === 'function'
    && typeof mediaDevices?.enumerateDevices === 'function';
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function clearCapture() {
  captureCanvas.width = 0;
  captureCanvas.height = 0;
}

function clearResult() {
  resultCanvas.width = 0;
  resultCanvas.height = 0;
  resultCanvas.hidden = true;
}

function stopSession(clearDevices = false) {
  session += 1;
  scanning = false;
  preparing = false;
  window.clearTimeout(frameTimer);
  frameTimer = 0;
  camera.stop();
  video.hidden = true;
  preview.hidden = true;
  cancelButton.hidden = true;
  enableButton.disabled = !cameraAvailable();
  enableButton.hidden = false;
  selectorLabel.hidden = false;
  selector.hidden = false;
  resetButton.hidden = true;
  selector.disabled = selector.options.length <= 1;
  selector.value = '';
  if (clearDevices) {
    selector.replaceChildren(new Option('Enable cameras to choose', ''));
    selector.disabled = true;
  }
  clearCapture();
}

function handleCameraEnded() {
  stopSession(true);
  clearResult();
  setStatus('The camera disconnected or access was revoked. Enable cameras to choose one again.', true);
}

function cameraError(error) {
  if (!cameraAvailable()) {
    return 'Camera access needs a secure context. Use localhost or a secure HTTPS site.';
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Camera access was not allowed. Check the browser permission and try again.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No camera is available. Connect a camera and try again.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'The camera could not start. It may be in use by another app.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'The camera could not be started. Please try again.';
}

async function enableCameras() {
  if (preparing || scanning) return;
  if (!cameraAvailable()) {
    setStatus(cameraError(), true);
    return;
  }
  stopSession(true);
  clearResult();
  const request = session;
  preparing = true;
  enableButton.disabled = true;
  cancelButton.hidden = false;
  try {
    const devices = await camera.prepare();
    if (request !== session) return;
    preparing = false;
    cancelButton.hidden = true;
    if (devices === null) {
      enableButton.disabled = !cameraAvailable();
      setStatus('Camera setup cancelled.');
      return;
    }
    selector.replaceChildren(new Option('Choose a camera…', ''));
    devices.forEach((device, index) => {
      selector.add(new Option(
        `${index + 1}. ${device.label?.trim() || `Camera ${index + 1}`}`,
        device.deviceId,
      ));
    });
    selector.disabled = devices.length === 0;
    enableButton.disabled = false;
    setStatus(devices.length ? 'Choose a camera to start.' : 'No cameras found. Connect one and try again.', !devices.length);
  } catch (error) {
    if (request !== session) return;
    stopSession(true);
    setStatus(cameraError(error), true);
  }
}

function scheduleFrame(request) {
  if (scanning && request === session) {
    frameTimer = window.setTimeout(() => scanFrame(request), 120);
  }
}

function scanFrame(request) {
  frameTimer = 0;
  if (!scanning || request !== session) return;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    scheduleFrame(request);
    return;
  }

  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  captureCanvas.width = width;
  captureCanvas.height = height;

  try {
    captureContext.drawImage(video, 0, 0, width, height);
    const bytes = decodeQr(captureContext.getImageData(0, 0, width, height));
    if (request !== session || !scanning) return;
    if (bytes === null) {
      scheduleFrame(request);
      return;
    }

    scanning = false;
    window.clearTimeout(frameTimer);
    camera.stop();
    selector.value = '';
    video.hidden = true;
    preview.hidden = true;
    cancelButton.hidden = true;
    selector.disabled = true;
    enableButton.hidden = true;
    selectorLabel.hidden = true;
    selector.hidden = true;
    setStatus('Verifying QR code…');

    try {
      const image = buildVerifiedQr(bytes);
      if (request !== session) return;
      resultCanvas.width = image.width;
      resultCanvas.height = image.height;
      resultCanvas.getContext('2d').putImageData(
        new ImageData(image.data, image.width, image.height), 0, 0,
      );
      resultCanvas.hidden = false;
      resetButton.hidden = false;
      setStatus('Verified QR code.');
    } catch (error) {
      if (request !== session) return;
      stopSession();
      setStatus(error instanceof Error ? error.message : 'Could not verify this QR code.', true);
    }
  } catch {
    if (request === session) {
      stopSession();
      setStatus('Could not read the camera frame. Start the scan again.', true);
    }
  } finally {
    clearCapture();
  }
}

async function startScan(deviceId) {
  if (scanning || preparing || !deviceId) return;
  stopSession();
  const request = session;
  scanning = true;
  selector.disabled = true;
  enableButton.disabled = true;
  cancelButton.hidden = false;
  preview.hidden = false;
  video.hidden = false;
  setStatus('Starting camera…');
  try {
    const started = await camera.start(deviceId);
    if (request !== session) return;
    if (!started) {
      stopSession();
      setStatus('Camera start cancelled.');
      return;
    }
    setStatus('Scanning…');
    scheduleFrame(request);
  } catch (error) {
    if (request !== session) return;
    stopSession();
    setStatus(cameraError(error), true);
  }
}

function cancel() {
  const wasPreparing = preparing;
  stopSession();
  setStatus(wasPreparing ? 'Camera setup cancelled.' : 'Scan cancelled.');
}

function reset() {
  stopSession();
  clearResult();
  setStatus('Choose a camera to scan again.');
}

enableButton.addEventListener('click', enableCameras);
selector.addEventListener('change', () => {
  if (selector.value) startScan(selector.value);
});
cancelButton.addEventListener('click', cancel);
resetButton.addEventListener('click', reset);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (scanning || preparing)) {
    stopSession();
    setStatus('Camera stopped because this tab is hidden. Start again when ready.');
  }
});
window.addEventListener('pagehide', () => {
  stopSession(true);
  clearResult();
});

if (!cameraAvailable()) {
  enableButton.disabled = true;
  setStatus(cameraError(), true);
}

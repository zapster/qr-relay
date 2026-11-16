const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

/**
 * Own the camera streams associated with one video element.
 * Camera preparation is intentionally only invoked by an explicit user action.
 *
 * @param {HTMLVideoElement} videoElement
 * @param {{onEnded?: () => void}} [options]
 * @returns {{prepare: () => Promise<Array<{deviceId: string, label: string}>|null>,
 *   start: (deviceId: string) => Promise<boolean>, stop: () => void}}
 */
export function createCamera(videoElement, options = {}) {
  if (!videoElement || !('srcObject' in videoElement)) {
    throw new TypeError('A video element is required.');
  }

  const onEnded = options?.onEnded;

  const ownedStreams = new Map();
  const endedListeners = new Map();
  let operationEpoch = 0;
  let prepareEpoch = 0;
  let startEpoch = 0;
  let selectedStream = null;

  function stopOwnedStream(stream) {
    if (!stream) {
      return;
    }
    if (!ownedStreams.has(stream)) {
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
      return;
    }
    removeEndedListeners(stream);
    try {
      let tracks = [];
      try {
        tracks = stream.getTracks();
      } catch {
        // Still release ownership and the video reference if the stream is broken.
      }
      for (const track of tracks) {
        try {
          track.stop();
        } catch {
          // Continue stopping every owned track if one browser track misbehaves.
        }
      }
    } finally {
      ownedStreams.delete(stream);
      if (selectedStream === stream) {
        selectedStream = null;
      }
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
    }
  }

  function stopStreamsOfKind(kind) {
    for (const [stream, streamKind] of ownedStreams) {
      if (streamKind === kind) {
        stopOwnedStream(stream);
      }
    }
  }

  function stop() {
    operationEpoch += 1;
    prepareEpoch += 1;
    startEpoch += 1;
    for (const stream of [...ownedStreams.keys()]) {
      stopOwnedStream(stream);
    }
    selectedStream = null;
    videoElement.srcObject = null;
  }

  function cameraMediaDevices(requireEnumeration) {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (
      typeof mediaDevices?.getUserMedia !== 'function'
      || (requireEnumeration && typeof mediaDevices?.enumerateDevices !== 'function')
    ) {
      throw new Error(
        'Camera access is unavailable. Use a supported browser in a secure context.',
      );
    }
    return mediaDevices;
  }

  function removeEndedListeners(stream) {
    const listeners = endedListeners.get(stream);
    if (!listeners) {
      return;
    }
    endedListeners.delete(stream);
    for (const { track, listener } of listeners) {
      try {
        track.removeEventListener?.('ended', listener);
      } catch {
        // A stale listener cannot take ownership of a stopped stream.
      }
    }
  }

  function watchSelectedStream(stream, isCurrent) {
    const listeners = [];
    const videoTracks = stream.getVideoTracks();
    for (const track of videoTracks) {
      if (!track.addEventListener || !track.removeEventListener) {
        continue;
      }
      const listener = () => {
        if (!isCurrent() || selectedStream !== stream) {
          return;
        }
        operationEpoch += 1;
        prepareEpoch += 1;
        startEpoch += 1;
        stopOwnedStream(stream);
        if (typeof onEnded === 'function') {
          onEnded();
        }
      };
      track.addEventListener('ended', listener);
      listeners.push({ track, listener });
    }
    if (listeners.length > 0) {
      endedListeners.set(stream, listeners);
    }
    if (videoTracks.some((track) => track.readyState === 'ended')) {
      for (const { track, listener } of listeners) {
        try {
          track.removeEventListener('ended', listener);
        } catch {
          // Continue cleaning the other tracks and invalidate the ended stream.
        }
      }
      endedListeners.delete(stream);
      operationEpoch += 1;
      prepareEpoch += 1;
      startEpoch += 1;
      stopOwnedStream(stream);
      if (typeof onEnded === 'function') {
        onEnded();
      }
    }
  }

  async function prepare() {
    const mediaDevices = cameraMediaDevices(true);
    const epoch = ++prepareEpoch;
    const operation = operationEpoch;
    const isCurrent = () => epoch === prepareEpoch && operation === operationEpoch;
    let probe = null;

    try {
      let devices = await mediaDevices.enumerateDevices();
      if (!isCurrent()) {
        return null;
      }
      let cameras = devices.filter((device) => device.kind === 'videoinput');
      if (cameras.length > 0 && cameras.every((camera) => camera.label.trim())) {
        return cameraOptions(cameras);
      }

      probe = await mediaDevices.getUserMedia({ audio: false, video: true });
      if (!isCurrent()) {
        stopTracks(probe);
        probe = null;
        return null;
      }
      ownedStreams.set(probe, 'probe');
      devices = await mediaDevices.enumerateDevices();
      if (!isCurrent()) {
        return null;
      }
      cameras = devices.filter((device) => device.kind === 'videoinput');
      return cameraOptions(cameras);
    } catch (error) {
      if (!isCurrent()) {
        return null;
      }
      throw error;
    } finally {
      if (probe) {
        stopOwnedStream(probe);
      }
    }
  }

  async function start(deviceId) {
    const mediaDevices = cameraMediaDevices(false);
    if (typeof deviceId !== 'string' || deviceId.length === 0) {
      throw new TypeError('A camera device identifier is required.');
    }

    const epoch = ++startEpoch;
    const operation = ++operationEpoch;
    const isCurrent = () => epoch === startEpoch && operation === operationEpoch;
    prepareEpoch += 1;
    stopStreamsOfKind('probe');
    if (selectedStream) {
      stopOwnedStream(selectedStream);
    }

    let stream;
    try {
      stream = await mediaDevices.getUserMedia({
        ...CAMERA_CONSTRAINTS,
        video: {
          ...CAMERA_CONSTRAINTS.video,
          deviceId: { exact: deviceId },
        },
      });
    } catch (error) {
      if (!isCurrent()) {
        return false;
      }
      throw error;
    }

    if (!isCurrent()) {
      stopTracks(stream);
      return false;
    }
    ownedStreams.set(stream, 'selected');
    selectedStream = stream;
    try {
      videoElement.srcObject = stream;
      watchSelectedStream(stream, isCurrent);
    } catch (error) {
      stopOwnedStream(stream);
      if (!isCurrent()) {
        return false;
      }
      throw error;
    }
    if (!isCurrent() || selectedStream !== stream) {
      stopOwnedStream(stream);
      return false;
    }

    try {
      await videoElement.play();
    } catch (error) {
      stopOwnedStream(stream);
      if (!isCurrent()) {
        return false;
      }
      throw error;
    }

    if (!isCurrent() || videoElement.srcObject !== stream) {
      stopOwnedStream(stream);
      return false;
    }
    return true;
  }

  return { prepare, start, stop };
}

function cameraOptions(devices) {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim() || `Camera ${index + 1}`,
  }));
}

function stopTracks(stream) {
  let tracks = [];
  try {
    tracks = stream.getTracks();
  } catch {
    return;
  }
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // A canceled, late stream must never be retained because a stop threw.
    }
  }
}

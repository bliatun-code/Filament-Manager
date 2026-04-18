function createDetector(windowRef) {
  if (!windowRef || typeof windowRef.BarcodeDetector !== "function") {
    return null;
  }

  return new windowRef.BarcodeDetector({ formats: ["qr_code"] });
}

export function supportsLiveQrScanner(windowRef = window, navigatorRef = navigator) {
  return Boolean(
    windowRef?.isSecureContext &&
      typeof navigatorRef?.mediaDevices?.getUserMedia === "function" &&
      createDetector(windowRef),
  );
}

export function supportsQrImageDecode(windowRef = window) {
  return Boolean(
    createDetector(windowRef) &&
      typeof windowRef?.createImageBitmap === "function" &&
      typeof windowRef?.File === "function",
  );
}

export async function decodeQrFromFile(file, options = {}) {
  const windowRef = options.windowRef ?? window;
  const detector = options.detector ?? createDetector(windowRef);
  if (!detector) {
    throw new Error("QR image decoding is not supported in this browser.");
  }
  if (!(file instanceof windowRef.File)) {
    throw new Error("No image file was selected.");
  }

  const bitmap = await windowRef.createImageBitmap(file);
  try {
    const results = await detector.detect(bitmap);
    const payload = String(results?.[0]?.rawValue || "").trim();
    if (!payload) {
      throw new Error("No QR code was found in the selected image.");
    }
    return payload;
  } finally {
    bitmap.close?.();
  }
}

export async function startLiveQrScanner(options) {
  const {
    video,
    onResult,
    onError,
    scanIntervalMs = 320,
    windowRef = window,
    navigatorRef = navigator,
  } = options;

  const detector = createDetector(windowRef);
  if (!detector) {
    throw new Error("Live QR scanning is not supported in this browser.");
  }
  if (!windowRef?.isSecureContext) {
    throw new Error("Live camera scanning requires a secure browser context.");
  }
  if (!video || typeof video.play !== "function") {
    throw new Error("QR scanner video element is unavailable.");
  }

  const stream = await navigatorRef.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
    },
    audio: false,
  });

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();

  let stopped = false;
  let timeoutId = 0;
  let lastPayload = "";

  const stop = () => {
    stopped = true;
    if (timeoutId) {
      windowRef.clearTimeout(timeoutId);
      timeoutId = 0;
    }
    const activeStream = video.srcObject;
    video.pause?.();
    video.srcObject = null;
    if (activeStream && typeof activeStream.getTracks === "function") {
      for (const track of activeStream.getTracks()) {
        track.stop();
      }
    }
  };

  const loop = async () => {
    if (stopped) {
      return;
    }

    try {
      const results = await detector.detect(video);
      const payload = String(results?.[0]?.rawValue || "").trim();
      if (payload && payload !== lastPayload) {
        lastPayload = payload;
        onResult?.(payload);
        return;
      }
    } catch (error) {
      onError?.(String(error?.message || error || ""));
    }

    timeoutId = windowRef.setTimeout(loop, scanIntervalMs);
  };

  loop();
  return stop;
}

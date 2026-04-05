import { scanFromCanvas } from "../qr/qr_scanner";

type CameraScanOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onResult: (payload: string) => void;
  onError?: (message: string) => void;
  scanIntervalMs?: number;
};

export async function startCameraScanner(options: CameraScanOptions) {
  const { video, canvas, onResult, onError, scanIntervalMs = 500 } = options;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
  });

  video.srcObject = stream;
  await video.play();

  const context = canvas.getContext("2d");
  if (!context) {
    onError?.("Canvas context unavailable");
    return () => stopStream(stream);
  }

  let isRunning = true;
  let lastResult = "";

  const loop = async () => {
    if (!isRunning) {
      return;
    }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const result = await scanFromCanvas(canvas);
    if (result && "text" in result && result.text !== lastResult) {
      lastResult = result.text;
      onResult(result.text);
    }
    setTimeout(loop, scanIntervalMs);
  };

  loop();

  return () => {
    isRunning = false;
    stopStream(stream);
  };
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

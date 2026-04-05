import { startCamera } from "./camera";

const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const endpointInput = document.getElementById("endpoint") as HTMLInputElement;
const connectButton = document.getElementById("connect") as HTMLButtonElement;
const snapshotButton = document.getElementById("snapshot") as HTMLButtonElement;

let socket: WebSocket | null = null;

function setStatus(message: string) {
  statusEl.textContent = message;
}

function connectSocket() {
  const endpoint = endpointInput.value.trim();
  if (!endpoint) {
    setStatus("Provide a websocket endpoint.");
    return;
  }
  if (socket) {
    socket.close();
  }
  socket = new WebSocket(endpoint);
  socket.onopen = () => setStatus("Connected");
  socket.onerror = () => setStatus("Connection error");
  socket.onclose = () => setStatus("Disconnected");
}

async function sendScan(payload: Record<string, unknown>) {
  const message = JSON.stringify(payload);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(message);
    return;
  }

  const endpoint = endpointInput.value.trim();
  if (endpoint.startsWith("http")) {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: message,
    });
  }
}

function readFrame(): ImageData | null {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function scanFrame() {
  const imageData = readFrame();
  if (!imageData) {
    return;
  }

  let result: string | null = null;
  if ("BarcodeDetector" in window) {
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(imageData);
    if (codes.length > 0) {
      result = codes[0].rawValue ?? null;
    }
  } else {
    setStatus("BarcodeDetector not available. Use Chrome/Edge.");
  }

  if (result) {
    setStatus(`QR: ${result}`);
    await sendScan({ type: "QR_SCAN", payload: result });
    return;
  }

  const color = extractAverageColor(imageData);
  setStatus(`Color estimate: ${color}`);
  await sendScan({ type: "COLOR_SCAN", payload: color });
}

function extractAverageColor(imageData: ImageData): string {
  const { data, width, height } = imageData;
  const startX = Math.floor(width * 0.35);
  const startY = Math.floor(height * 0.35);
  const endX = Math.floor(width * 0.65);
  const endY = Math.floor(height * 0.65);

  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let count = 0;

  for (let row = startY; row < endY; row += 4) {
    for (let column = startX; column < endX; column += 4) {
      const idx = (row * width + column) * 4;
      totalRed += data[idx];
      totalGreen += data[idx + 1];
      totalBlue += data[idx + 2];
      count += 1;
    }
  }

  const red = Math.round(totalRed / count);
  const green = Math.round(totalGreen / count);
  const blue = Math.round(totalBlue / count);

  return `#${[red, green, blue]
    .map((val) => val.toString(16).padStart(2, "0"))
    .join("")}`;
}

connectButton.addEventListener("click", connectSocket);
snapshotButton.addEventListener("click", scanFrame);

startCamera(video)
  .then(() => setStatus("Camera ready"))
  .catch((error) => setStatus(`Camera error: ${String(error)}`));

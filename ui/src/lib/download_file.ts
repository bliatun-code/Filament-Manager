type DownloadBlob = Blob;

type DownloadAnchor = {
  href: string;
  download: string;
  click(): void;
};

type DownloadDocument = {
  createElement(tagName: "a"): DownloadAnchor;
};

type DownloadUrlApi = {
  createObjectURL(blob: DownloadBlob): string;
  revokeObjectURL(url: string): void;
};

type DownloadBlobConstructor = {
  new (blobParts?: BlobPart[], options?: BlobPropertyBag): DownloadBlob;
};

export type DownloadFileEnvironment = {
  Blob?: DownloadBlobConstructor;
  URL?: DownloadUrlApi;
  document?: DownloadDocument;
};

export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string,
  environment: DownloadFileEnvironment = globalThis as unknown as DownloadFileEnvironment,
): void {
  if (!environment.Blob || !environment.URL || !environment.document) {
    throw new Error("File download unavailable");
  }

  const blob = new environment.Blob([content], { type: mimeType });
  const url = environment.URL.createObjectURL(blob);
  try {
    const anchor = environment.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    environment.URL.revokeObjectURL(url);
  }
}

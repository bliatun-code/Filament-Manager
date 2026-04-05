type ClipboardWriter = {
  writeText(text: string): Promise<void>;
};

type ClipboardNavigator = {
  clipboard?: ClipboardWriter;
};

type ClipboardTextarea = {
  value: string;
  setAttribute(name: string, value: string): void;
  style: {
    position: string;
    left: string;
  };
  select(): void;
};

type ClipboardDocument = {
  createElement(tagName: string): ClipboardTextarea;
  body?: {
    appendChild(node: unknown): void;
    removeChild(node: unknown): void;
  };
  execCommand?(command: string): boolean;
};

type ClipboardEnvironment = {
  navigator?: ClipboardNavigator;
  document?: ClipboardDocument;
};

export async function copyTextToClipboard(
  text: string,
  environment: ClipboardEnvironment = globalThis as unknown as ClipboardEnvironment,
): Promise<void> {
  if (environment.navigator?.clipboard?.writeText) {
    await environment.navigator.clipboard.writeText(text);
    return;
  }

  const documentRef = environment.document;
  if (!documentRef?.body || typeof documentRef.execCommand !== "function") {
    throw new Error("Clipboard copy unavailable");
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = documentRef.execCommand("copy");
  documentRef.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

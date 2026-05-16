declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;
    };
    __TAURI_INTERNALS__?: unknown;
  }
}

type InvokeFn = <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;

let cachedInvoke: InvokeFn | null = null;

export function hasTauriRuntime(): boolean {
  return Boolean(window.__TAURI__?.invoke || window.__TAURI_INTERNALS__);
}

async function resolveInvoke(): Promise<InvokeFn> {
  if (cachedInvoke) {
    return cachedInvoke;
  }
  if (window.__TAURI__?.invoke) {
    cachedInvoke = window.__TAURI__.invoke.bind(window.__TAURI__);
    return cachedInvoke;
  }
  if (!hasTauriRuntime()) {
    throw new Error("Tauri API not available");
  }
  const mod = await import("@tauri-apps/api/core");
  cachedInvoke = mod.invoke;
  return cachedInvoke;
}

export async function invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const invoker = await resolveInvoke();
  return invoker<T>(command, payload);
}

export function isTauri(): boolean {
  return hasTauriRuntime();
}

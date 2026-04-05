export type SpoolRow = {
  id: string;
  master_id: string;
  qr_code?: string | null;
  status: string;
  initial_weight_g?: number | null;
  current_weight_g?: number | null;
  remaining_g?: number | null;
  location_id?: string | null;
};

export type MasterRow = {
  id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  image_url?: string | null;
  product_url?: string | null;
  default_weight: number;
  vendor: string;
};

export type SpoolWithMasterRow = {
  spool: SpoolRow;
  master: MasterRow;
};

export type InventoryOverview = {
  total_spools: number;
  in_use: number;
  low_stock: number;
  total_consumption_30d: number;
};

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

function hasTauriRuntime(): boolean {
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

async function invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const invoker = await resolveInvoke();
  return invoker<T>(command, payload);
}

export function isTauri(): boolean {
  return hasTauriRuntime();
}

export async function listSpools(limit = 100, offset = 0) {
  return invoke<SpoolWithMasterRow[]>("list_spools", { limit, offset });
}

export async function updateSpoolWeight(spoolId: string, grams: number) {
  return invoke<void>("update_spool_weight", {
    spoolId,
    grams,
    source: "MANUAL",
  });
}

export async function inventoryOverview() {
  return invoke<InventoryOverview>("inventory_overview");
}

export async function exportInventoryCsv() {
  return invoke<{ content: string }>("export_inventory_csv");
}

export async function exportInventoryJson() {
  return invoke<{ content: string }>("export_inventory_json");
}

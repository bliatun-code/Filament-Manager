import type {
  CatalogRefreshJobSnapshot,
  StartCatalogRefreshJobInput,
} from "./tauri_catalog_client";
import type { CatalogWriteTarget } from "./catalog_writes";
import { appErrorCode, diagnosticErrorText } from "./error_text";

export type CatalogRefreshJobState = {
  busy: boolean;
  uncertain: boolean;
  job: CatalogRefreshJobSnapshot | null;
  request: StartCatalogRefreshJobInput | null;
  error: string | null;
};

type JobStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type JobDependencies = {
  start: (input: StartCatalogRefreshJobInput) => Promise<CatalogRefreshJobSnapshot>;
  get: (jobId: string | null) => Promise<CatalogRefreshJobSnapshot | null>;
  storage: JobStorage;
  uuid: () => string;
  schedule: (callback: () => void) => unknown;
  cancel: (timer: unknown) => void;
};

export function catalogRefreshJobTargetKey(target: CatalogWriteTarget): string | null {
  const libraryId = target.clientLibraryId?.trim();
  if (!target.clientReadOnly) {
    const generation = target.clientTargetGeneration;
    return libraryId && Number.isSafeInteger(generation) && (generation ?? -1) >= 0
      ? JSON.stringify(["local", libraryId, generation])
      : null;
  }
  const baseUrl = target.clientHostBaseUrl?.trim().replace(/\/+$/, "");
  return baseUrl && libraryId ? JSON.stringify([baseUrl, libraryId]) : null;
}

export function catalogRefreshJobStorageKey(targetKey: string): string {
  return `filament-manager.catalog-refresh-job.v1:${targetKey}`;
}

function readRequest(storage: JobStorage, key: string): StartCatalogRefreshJobInput | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const input = value as Partial<StartCatalogRefreshJobInput>;
    if (
      typeof input.job_id !== "string" || !input.job_id.trim() ||
      (input.vendor !== "Bambu" && input.vendor !== "eSUN") ||
      typeof input.material !== "string" || !input.material.trim()
    ) return null;
    return input as StartCatalogRefreshJobInput;
  } catch {
    return null;
  }
}

/**
 * The Host is the job arbiter. This controller only remembers the last request
 * and follows it with read-only calls; a dropped response never retries a POST.
 * Disposal fences both results and persistence when the library target changes.
 */
export class CatalogRefreshJobController {
  private state: CatalogRefreshJobState;
  private readonly storageKey: string;
  private listeners = new Set<(state: CatalogRefreshJobState) => void>();
  private pendingJobId: string | null;
  private disposed = false;
  private watching = false;
  private sending = false;
  private revision = 0;
  private pollPromise: Promise<void> | null = null;
  private timer: unknown = null;
  private readonly dependencies: JobDependencies;

  constructor(targetKey: string, dependencies: JobDependencies) {
    this.dependencies = dependencies;
    this.storageKey = catalogRefreshJobStorageKey(targetKey);
    const request = readRequest(dependencies.storage, this.storageKey);
    this.pendingJobId = request?.job_id ?? null;
    this.state = { busy: true, uncertain: false, job: null, request, error: null };
  }

  snapshot(): CatalogRefreshJobState { return this.state; }

  subscribe(listener: (state: CatalogRefreshJobState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  resume(): void {
    if (this.disposed) return;
    this.watching = true;
    void this.checkNow();
  }

  pause(): void {
    this.watching = false;
    if (!this.pendingJobId && !this.sending) this.clearTimer();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  async start(vendor: "Bambu" | "eSUN", material: string): Promise<boolean> {
    if (this.disposed || this.state.busy || !material.trim()) return false;
    const request = {
      job_id: this.dependencies.uuid(), vendor, material: material.trim(),
    };
    // Persistence must succeed before submitting an operation whose response
    // could be lost if this webview reloads.
    try {
      this.dependencies.storage.setItem(this.storageKey, JSON.stringify(request));
    } catch (error) {
      this.publish({ busy: false, uncertain: false, job: null, request, error: String(error) });
      return false;
    }
    this.revision += 1;
    this.pendingJobId = request.job_id;
    this.sending = true;
    this.publish({ busy: true, uncertain: false, job: null, request, error: null });
    try {
      const job = await this.dependencies.start(request);
      if (this.disposed) return true;
      this.accept(job);
    } catch (error) {
      if (this.disposed) return true;
      if (appErrorCode(error) === "catalog.refresh.host_unsupported") {
        // Only this preflight rejection guarantees that the start command did
        // not submit a POST. Never infer non-acceptance from a generic error.
        this.pendingJobId = null;
        try {
          if (readRequest(this.dependencies.storage, this.storageKey)?.job_id === request.job_id) {
            this.dependencies.storage.removeItem(this.storageKey);
          }
        } catch { /* Read-only recovery can clear a retained record later. */ }
        this.publish({ ...this.state, busy: false, uncertain: false, error: diagnosticErrorText(error) });
      } else {
        this.publish({ ...this.state, uncertain: true, error: diagnosticErrorText(error) });
      }
    } finally {
      this.sending = false;
      if (!this.disposed) {
        if (this.state.uncertain) await this.checkNow();
        this.schedule();
      }
    }
    return true;
  }

  checkNow(): Promise<void> {
    if (this.disposed || this.sending) return Promise.resolve();
    if (this.pollPromise) return this.pollPromise;
    this.clearTimer();
    const revision = this.revision;
    this.pollPromise = this.poll(revision).finally(() => {
      this.pollPromise = null;
      this.schedule();
    });
    return this.pollPromise;
  }

  private async poll(revision: number): Promise<void> {
    const pendingJobId = this.pendingJobId;
    try {
      const ownJob = await this.dependencies.get(pendingJobId);
      if (this.disposed || revision !== this.revision) return;
      if (ownJob) {
        this.accept(ownJob);
        return;
      }
      if (pendingJobId) {
        // A rejected competing start can be absent while another client's job
        // is running. Adopt that actual job, including its vendor and material.
        const activeJob = await this.dependencies.get(null);
        if (this.disposed || revision !== this.revision) return;
        if (activeJob) {
          this.accept(activeJob);
          return;
        }
        if (readRequest(this.dependencies.storage, this.storageKey)?.job_id === pendingJobId) {
          this.dependencies.storage.removeItem(this.storageKey);
        }
        this.pendingJobId = null;
        this.publish({
          ...this.state, busy: false, uncertain: false,
          error: this.state.error ?? "The catalog refresh job was not found on this library.",
        });
        return;
      }
      if (this.state.busy || this.state.uncertain) {
        this.publish({ ...this.state, busy: false, uncertain: false, error: null });
      }
    } catch (error) {
      if (this.disposed || revision !== this.revision) return;
      this.publish({
        ...this.state, busy: this.pendingJobId !== null,
        uncertain: true, error: diagnosticErrorText(error),
      });
    }
  }

  private accept(job: CatalogRefreshJobSnapshot): void {
    const request = { job_id: job.job_id, vendor: job.vendor, material: job.material };
    // Keep the last ID after completion as well, so the result can be recovered
    // after a reload. A new explicit start replaces it.
    try {
      const saved = readRequest(this.dependencies.storage, this.storageKey);
      if (
        !saved || saved.job_id === this.pendingJobId ||
        saved.job_id === this.state.request?.job_id || saved.job_id === job.job_id
      ) {
        this.dependencies.storage.setItem(this.storageKey, JSON.stringify(request));
      }
    } catch {
      // A submitted job must still be followed if storage becomes unavailable.
    }
    this.pendingJobId = job.status === "RUNNING" ? job.job_id : null;
    this.publish({
      busy: this.pendingJobId !== null, uncertain: false, job, request,
      error: job.error,
    });
  }

  private publish(state: CatalogRefreshJobState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.dependencies.cancel(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.disposed || this.timer !== null || this.sending) return;
    if (!this.watching && !this.pendingJobId) return;
    this.timer = this.dependencies.schedule(() => {
      this.timer = null;
      void this.checkNow();
    });
  }
}

import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { FilamentStandardsSnapshot } from "../lib/tauri_client";
import { useSettingsFilamentDefaults } from "./use_settings_filament_defaults";

type DependencyList = readonly unknown[] | undefined;
type StateUpdater<Value> = Value | ((previous: Value) => Value);
type EffectCleanup = void | (() => void);

type StateCell<Value = unknown> = {
  kind: "state";
  value: Value;
  setValue: (next: StateUpdater<Value>) => void;
};

type RefCell<Value = unknown> = {
  kind: "ref";
  value: { current: Value };
};

type MemoCell<Value = unknown> = {
  kind: "memo";
  dependencies: DependencyList;
  value: Value;
};

type EffectCell = {
  kind: "effect";
  cleanup: EffectCleanup;
  create: () => EffectCleanup;
  dependencies: DependencyList;
};

type HookCell = StateCell | RefCell | MemoCell | EffectCell;

type ReactClientInternals = {
  H: unknown;
};

const reactClientInternals = (
  await import("react")
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as unknown as ReactClientInternals;

function dependenciesMatch(
  previous: DependencyList,
  next: DependencyList,
): boolean {
  if (previous === undefined || next === undefined) {
    return false;
  }
  return (
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]))
  );
}

class HookHarness<Props, Result> {
  private readonly cells: HookCell[] = [];
  private readonly execute: (props: Props) => Result;
  private cursor = 0;
  private dirty = false;
  private pendingEffects: number[] = [];
  private props: Props;

  current!: Result;

  private readonly dispatcher = {
    useCallback: <Value>(callback: Value, dependencies: DependencyList) =>
      this.useMemo(() => callback, dependencies),
    useEffect: (create: () => EffectCleanup, dependencies: DependencyList) =>
      this.useEffect(create, dependencies),
    useMemo: <Value>(factory: () => Value, dependencies: DependencyList) =>
      this.useMemo(factory, dependencies),
    useRef: <Value>(initialValue: Value) => this.useRef(initialValue),
    useState: <Value>(initialValue: Value | (() => Value)) =>
      this.useState(initialValue),
  };

  constructor(execute: (props: Props) => Result, props: Props) {
    this.execute = execute;
    this.props = props;
    this.performRender();
  }

  render(props: Props): void {
    this.props = props;
    this.performRender();
  }

  async flush(): Promise<void> {
    for (let round = 0; round < 20; round += 1) {
      await Promise.resolve();
      if (this.dirty) {
        this.performRender();
      }
    }
  }

  unmount(): void {
    for (const cell of this.cells) {
      if (cell.kind === "effect") {
        cell.cleanup?.();
      }
    }
  }

  private nextCell(): { cell: HookCell | undefined; index: number } {
    const index = this.cursor;
    this.cursor += 1;
    return { cell: this.cells[index], index };
  }

  private performRender(): void {
    do {
      this.dirty = false;
      this.cursor = 0;
      this.pendingEffects = [];
      const previousDispatcher = reactClientInternals.H;
      reactClientInternals.H = this.dispatcher;
      try {
        this.current = this.execute(this.props);
      } finally {
        reactClientInternals.H = previousDispatcher;
      }
      this.commitEffects();
    } while (this.dirty);
  }

  private commitEffects(): void {
    for (const index of this.pendingEffects) {
      const cell = this.cells[index];
      if (!cell || cell.kind !== "effect") {
        throw new Error("Hook effect cell was not initialized");
      }
      cell.cleanup?.();
      cell.cleanup = cell.create();
    }
  }

  private useEffect(
    create: () => EffectCleanup,
    dependencies: DependencyList,
  ): void {
    const { cell, index } = this.nextCell();
    if (!cell) {
      this.cells[index] = {
        kind: "effect",
        cleanup: undefined,
        create,
        dependencies,
      };
      this.pendingEffects.push(index);
      return;
    }
    if (cell.kind !== "effect") {
      throw new Error("Hook order changed while rendering an effect");
    }
    if (!dependenciesMatch(cell.dependencies, dependencies)) {
      cell.create = create;
      cell.dependencies = dependencies;
      this.pendingEffects.push(index);
    }
  }

  private useMemo<Value>(
    factory: () => Value,
    dependencies: DependencyList,
  ): Value {
    const { cell, index } = this.nextCell();
    if (!cell) {
      const value = factory();
      this.cells[index] = {
        kind: "memo",
        dependencies,
        value,
      };
      return value;
    }
    if (cell.kind !== "memo") {
      throw new Error("Hook order changed while rendering a memo");
    }
    if (!dependenciesMatch(cell.dependencies, dependencies)) {
      cell.dependencies = dependencies;
      cell.value = factory();
    }
    return cell.value as Value;
  }

  private useRef<Value>(initialValue: Value): { current: Value } {
    const { cell, index } = this.nextCell();
    if (!cell) {
      const value = { current: initialValue };
      this.cells[index] = { kind: "ref", value };
      return value;
    }
    if (cell.kind !== "ref") {
      throw new Error("Hook order changed while rendering a ref");
    }
    return cell.value as { current: Value };
  }

  private useState<Value>(
    initialValue: Value | (() => Value),
  ): [Value, (next: StateUpdater<Value>) => void] {
    const { cell, index } = this.nextCell();
    if (!cell) {
      const stateCell: StateCell<Value> = {
        kind: "state",
        value:
          typeof initialValue === "function"
            ? (initialValue as () => Value)()
            : initialValue,
        setValue: (next) => {
          const value =
            typeof next === "function"
              ? (next as (previous: Value) => Value)(stateCell.value)
              : next;
          if (!Object.is(value, stateCell.value)) {
            stateCell.value = value;
            this.dirty = true;
          }
        },
      };
      this.cells[index] = stateCell;
      return [stateCell.value, stateCell.setValue];
    }
    if (cell.kind !== "state") {
      throw new Error("Hook order changed while rendering state");
    }
    const stateCell = cell as StateCell<Value>;
    return [stateCell.value, stateCell.setValue];
  }
}

type HookProps = Parameters<typeof useSettingsFilamentDefaults>[0];
type HookResult = ReturnType<typeof useSettingsFilamentDefaults>;

function props(overrides: Partial<HookProps> = {}): HookProps {
  return {
    clientHostBaseUrl: "https://host-a.test",
    clientHostWritePaired: true,
    clientLibraryId: "library-a",
    clientReadOnly: true,
    clientTargetGeneration: 1,
    fallbackSpoolRows: [],
    onInventoryChanged: () => undefined,
    onLoadError: () => undefined,
    roleResolved: true,
    tauri: true,
    ...overrides,
  };
}

function snapshot(currency: string): FilamentStandardsSnapshot {
  return {
    settings: {
      schema_version: 1,
      default_purchase_currency: currency,
      price_standards: [],
    },
    settings_valid: true,
    groups: [],
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type InvokeHandler = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

let invokeHandler: InvokeHandler = async () => {
  throw new Error("Unexpected Tauri command");
};
const previousWindow = globalThis.window;
globalThis.window = {
  __TAURI__: {
    invoke: (command: string, payload?: Record<string, unknown>) =>
      invokeHandler(command, payload),
  },
} as unknown as Window & typeof globalThis;

after(() => {
  globalThis.window = previousWindow;
});

test("blank client Host coordinates do not start a Host request", async () => {
  const calls: string[] = [];
  invokeHandler = async (command) => {
    calls.push(command);
    return snapshot("NOK");
  };
  const harness = new HookHarness<HookProps, HookResult>(
    useSettingsFilamentDefaults,
    props({ clientHostBaseUrl: "   " }),
  );

  await harness.flush();

  assert.deepEqual(calls, []);
  assert.equal(harness.current.busy, false);
  assert.equal(harness.current.hostTargetMissing, true);
  assert.equal(harness.current.loadFailed, false);
  harness.unmount();
});

test("a failed client load can retry and replace the failure with Host data", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  let attempts = 0;
  invokeHandler = async (command) => {
    assert.equal(command, "fetch_library_sync_filament_standards");
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Host is temporarily unavailable");
    }
    return snapshot("EUR");
  };
  const harness = new HookHarness<HookProps, HookResult>(
    useSettingsFilamentDefaults,
    props(),
  );

  await harness.flush();
  assert.equal(attempts, 1);
  assert.equal(harness.current.loadFailed, true);
  assert.equal(harness.current.defaultCurrency, "");

  await harness.current.retryLoad();
  await harness.flush();

  assert.equal(attempts, 2);
  assert.equal(harness.current.loadFailed, false);
  assert.equal(harness.current.defaultCurrency, "EUR");
  assert.equal(harness.current.busy, false);
  harness.unmount();
});

test("a late response from the previous Host target cannot replace the current target", async () => {
  const hostA = deferred<FilamentStandardsSnapshot>();
  const hostB = deferred<FilamentStandardsSnapshot>();
  const requestedUrls: string[] = [];
  invokeHandler = async (command, payload) => {
    assert.equal(command, "fetch_library_sync_filament_standards");
    const input = payload?.input as { base_url?: string } | undefined;
    const baseUrl = input?.base_url ?? "";
    requestedUrls.push(baseUrl);
    return baseUrl === "https://host-a.test" ? hostA.promise : hostB.promise;
  };
  const stableProps = props();
  const harness = new HookHarness<HookProps, HookResult>(
    useSettingsFilamentDefaults,
    stableProps,
  );
  await harness.flush();

  harness.render({
    ...stableProps,
    clientHostBaseUrl: "https://host-b.test",
    clientLibraryId: "library-b",
    clientTargetGeneration: 2,
  });
  await harness.flush();
  assert.deepEqual(requestedUrls, [
    "https://host-a.test",
    "https://host-b.test",
  ]);

  hostB.resolve(snapshot("EUR"));
  await harness.flush();
  assert.equal(harness.current.defaultCurrency, "EUR");
  assert.equal(harness.current.busy, false);

  hostA.resolve(snapshot("USD"));
  await harness.flush();
  assert.equal(harness.current.defaultCurrency, "EUR");
  assert.equal(harness.current.loadFailed, false);
  harness.unmount();
});

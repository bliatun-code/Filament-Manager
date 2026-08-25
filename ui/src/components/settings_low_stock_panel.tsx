import { useEffect, useMemo, useState } from "react";

import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import {
  LOW_STOCK_THRESHOLD_MAX_G,
  LOW_STOCK_THRESHOLD_MIN_G,
  normalizeLowStockMaterialDisplayName,
  normalizeLowStockMaterialKey,
  normalizeLowStockPolicy,
} from "../lib/low_stock_policy";
import {
  buildLowStockPolicyFromDraft,
  parseLowStockThreshold,
  type LowStockOverrideDraft,
} from "../lib/settings_low_stock_model";
import type { LowStockPolicy } from "../lib/tauri_client";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
} from "../lib/settings_ui_classes";
import { SettingsSurfaceCard } from "./settings_ui";

type TranslateFn = (key: string, fallback: string, params?: MessageParams) => string;

export type SettingsLowStockPanelProps = {
  busy: boolean;
  materialOptions: string[];
  policy?: LowStockPolicy | null;
  policyValid: boolean;
  readOnly: boolean;
  t: TranslateFn;
  onSave: (policy: LowStockPolicy) => Promise<void> | void;
};

function policyDrafts(policy?: LowStockPolicy | null) {
  const normalized = normalizeLowStockPolicy(policy);
  return {
    defaultThresholdRaw: String(normalized.default_threshold_g),
    overrides: normalized.material_overrides.map((item) => ({
      materialKey: item.material_key,
      material: item.material,
      thresholdRaw: String(item.threshold_g),
    })),
  };
}

export function SettingsLowStockPanel({
  busy,
  materialOptions,
  policy,
  policyValid,
  readOnly,
  t,
  onSave,
}: SettingsLowStockPanelProps) {
  const initialDraft = useMemo(() => policyDrafts(policy), [policy]);
  const [defaultThresholdRaw, setDefaultThresholdRaw] = useState(
    initialDraft.defaultThresholdRaw,
  );
  const [overrides, setOverrides] = useState<LowStockOverrideDraft[]>(
    initialDraft.overrides,
  );
  const [selectedMaterialKey, setSelectedMaterialKey] = useState("");
  const [newThresholdRaw, setNewThresholdRaw] = useState(
    initialDraft.defaultThresholdRaw,
  );

  useEffect(() => {
    setDefaultThresholdRaw(initialDraft.defaultThresholdRaw);
    setOverrides(initialDraft.overrides);
    setNewThresholdRaw(initialDraft.defaultThresholdRaw);
  }, [initialDraft]);

  const normalizedMaterialOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const raw of [
      ...materialOptions,
      ...overrides.map((item) => item.material),
    ]) {
      const material = normalizeLowStockMaterialDisplayName(raw);
      const key = normalizeLowStockMaterialKey(material);
      if (key && !values.has(key)) {
        values.set(key, material);
      }
    }
    return Array.from(values, ([key, material]) => ({ key, material })).sort(
      (left, right) => left.material.localeCompare(right.material),
    );
  }, [materialOptions, overrides]);

  const policyDraft = buildLowStockPolicyFromDraft({
    defaultThresholdRaw,
    overrides,
  });
  const defaultThreshold = parseLowStockThreshold(defaultThresholdRaw);
  const newThreshold = parseLowStockThreshold(newThresholdRaw);
  const selectedMaterial = normalizedMaterialOptions.find(
    (item) => item.key === selectedMaterialKey,
  );
  const thresholdError = t(
    "settings.lowStockThresholdValidation",
    `Enter a whole number from ${LOW_STOCK_THRESHOLD_MIN_G} to ${LOW_STOCK_THRESHOLD_MAX_G} g.`,
  );

  function selectMaterial(materialKey: string) {
    setSelectedMaterialKey(materialKey);
    const current = overrides.find((item) => item.materialKey === materialKey);
    setNewThresholdRaw(
      current?.thresholdRaw ?? defaultThresholdRaw,
    );
  }

  function setOverride() {
    if (!selectedMaterial || newThreshold == null) {
      return;
    }
    setOverrides((current) => {
      const next = current.filter((item) => item.materialKey !== selectedMaterial.key);
      next.push({
        materialKey: selectedMaterial.key,
        material: selectedMaterial.material,
        thresholdRaw: String(newThreshold),
      });
      return next.sort((left, right) => left.material.localeCompare(right.material));
    });
  }

  return (
    <SettingsSurfaceCard
      className="min-w-0 space-y-4"
      eyebrow={t("settings.lowStockThresholds", "Low-stock thresholds")}
      description={t(
        "settings.lowStockThresholdsHint",
        "Set one default for the library and override it only for materials that need a different restock point.",
      )}
    >
      {readOnly ? (
        <p className="surface-subtle px-3 py-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {t(
            "settings.lowStockThresholdsReadOnly",
            "Manage these library-wide thresholds on the Host desktop app.",
          )}
        </p>
      ) : null}
      {!policyValid && !readOnly ? (
        <p
          className="rounded-lg border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
          role="alert"
        >
          {t(
            "settings.lowStockPolicyRepair",
            "The saved low-stock policy is damaged. Inventory and statistics stay unavailable until you save a valid replacement here; the 200 g value below is only a repair draft.",
          )}
        </p>
      ) : null}

      <label className="block max-w-xs text-sm font-medium text-slate-700 dark:text-slate-200">
        {t("settings.lowStockDefaultThreshold", "Default threshold")}
        <span className="mt-1 flex items-center gap-2">
          <input
            aria-label={t("settings.lowStockDefaultThreshold", "Default threshold")}
            className={settingsFormControlClass}
            disabled={busy || readOnly}
            inputMode="numeric"
            min={LOW_STOCK_THRESHOLD_MIN_G}
            max={LOW_STOCK_THRESHOLD_MAX_G}
            step={1}
            type="number"
            value={defaultThresholdRaw}
            onChange={(event) => setDefaultThresholdRaw(event.target.value)}
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">g</span>
        </span>
      </label>
      {defaultThreshold == null ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {thresholdError}
        </p>
      ) : null}

      <div className="surface-subtle space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("settings.lowStockMaterialOverrides", "Material overrides")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {t(
              "settings.lowStockMaterialInheritance",
              "Materials without an override inherit the library default.",
            )}
          </p>
        </div>

        {overrides.length > 0 ? (
          <div className="grid gap-2">
            {overrides.map((item) => (
              <div
                className="grid gap-2 rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/30 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,12rem)_auto] sm:items-end"
                key={item.materialKey}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {item.material}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.lowStockOverridesDefault", "Overrides the default")}
                  </p>
                </div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("settings.lowStockThresholdGrams", "Threshold (g)")}
                  <input
                    aria-label={`${item.material} · ${t("settings.lowStockThresholdGrams", "Threshold (g)")}`}
                    className={`${settingsFormControlClass} mt-1`}
                    disabled={busy || readOnly}
                    inputMode="numeric"
                    min={LOW_STOCK_THRESHOLD_MIN_G}
                    max={LOW_STOCK_THRESHOLD_MAX_G}
                    step={1}
                    type="number"
                    value={item.thresholdRaw}
                    onChange={(event) =>
                      setOverrides((current) =>
                        current.map((candidate) =>
                          candidate.materialKey === item.materialKey
                            ? { ...candidate, thresholdRaw: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  className={settingsActionButtonClass("neutral")}
                  disabled={busy || readOnly}
                  type="button"
                  onClick={() =>
                    setOverrides((current) =>
                      current.filter(
                        (candidate) => candidate.materialKey !== item.materialKey,
                      ),
                    )
                  }
                >
                  {t("settings.lowStockUseDefault", "Use default")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              "settings.lowStockAllMaterialsInherit",
              "All materials currently inherit the default threshold.",
            )}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,12rem)_auto] sm:items-end">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {t("settings.lowStockMaterial", "Material")}
            <select
              aria-label={t("settings.lowStockMaterial", "Material")}
              className={`${settingsFormControlClass} mt-1`}
              disabled={busy || readOnly || normalizedMaterialOptions.length === 0}
              value={selectedMaterialKey}
              onChange={(event) => selectMaterial(event.target.value)}
            >
              <option value="">
                {t("settings.lowStockChooseMaterial", "Choose material")}
              </option>
              {normalizedMaterialOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.material}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {t("settings.lowStockThresholdGrams", "Threshold (g)")}
            <input
              aria-label={t("settings.lowStockNewOverrideThreshold", "New override threshold")}
              className={`${settingsFormControlClass} mt-1`}
              disabled={busy || readOnly || !selectedMaterial}
              inputMode="numeric"
              min={LOW_STOCK_THRESHOLD_MIN_G}
              max={LOW_STOCK_THRESHOLD_MAX_G}
              step={1}
              type="number"
              value={newThresholdRaw}
              onChange={(event) => setNewThresholdRaw(event.target.value)}
            />
          </label>
          <button
            className={settingsActionButtonClass("neutral")}
            disabled={busy || readOnly || !selectedMaterial || newThreshold == null}
            type="button"
            onClick={setOverride}
          >
            {t("settings.lowStockSetOverride", "Set override")}
          </button>
        </div>
        {selectedMaterial && newThreshold == null ? (
          <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
            {thresholdError}
          </p>
        ) : selectedMaterial && defaultThreshold != null ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              "settings.lowStockSelectedMaterialInheritance",
              "Without an override, this material inherits {count} g.",
            ).replace("{count}", String(defaultThreshold))}
          </p>
        ) : null}
      </div>

      {policyDraft == null && defaultThreshold != null ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {thresholdError}
        </p>
      ) : null}
      <button
        className={settingsActionButtonClass("primary")}
        disabled={busy || readOnly || policyDraft == null}
        type="button"
        onClick={() => {
          if (policyDraft) {
            void onSave(policyDraft);
          }
        }}
      >
        {busy
          ? t("settings.lowStockSaving", "Saving thresholds…")
          : t("settings.lowStockSave", "Save thresholds")}
      </button>
    </SettingsSurfaceCard>
  );
}

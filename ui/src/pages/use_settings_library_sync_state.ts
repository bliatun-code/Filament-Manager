import { useState } from "react";
import type {
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import type { LibrarySyncMode } from "./settings_library_sync_model";

export function useSettingsLibrarySyncState() {
  const [librarySyncSettings, setLibrarySyncSettings] = useState<LibrarySyncSettings | null>(null);
  const [librarySyncModeDraft, setLibrarySyncModeDraft] = useState<LibrarySyncMode>("STANDALONE");
  const [librarySyncDeviceNameDraft, setLibrarySyncDeviceNameDraft] = useState("");
  const [librarySyncHostBaseUrlDraft, setLibrarySyncHostBaseUrlDraft] = useState("");
  const [librarySyncPairingDraft, setLibrarySyncPairingDraft] = useState("");
  const [librarySyncBusy, setLibrarySyncBusy] = useState(false);
  const [librarySyncValidationBusy, setLibrarySyncValidationBusy] = useState(false);
  const [librarySyncValidation, setLibrarySyncValidation] =
    useState<LibrarySyncHostValidationResult | null>(null);
  const [librarySyncSnapshotBusy, setLibrarySyncSnapshotBusy] = useState(false);
  const [librarySyncSnapshot, setLibrarySyncSnapshot] =
    useState<LibrarySyncRemoteSnapshot | null>(null);

  return {
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncSnapshotBusy,
    librarySyncValidation,
    librarySyncValidationBusy,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
  };
}

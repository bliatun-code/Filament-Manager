import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { AppModal } from "./app_modal";
import {
  inventoryModalOverlayClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { ModalActionButton } from "./modal_action_button";
import { ModalBody, ModalFooter, ModalHeader } from "./modal_chrome";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
  BambuFilamentCodeBatchRow,
} from "../lib/bambu_filament_code_batch";
import { appendBambuFilamentCodeBatchScanInput } from "../lib/bambu_filament_code_batch";
import { formatMasterDisplayTitle } from "../lib/inventory_list_model";

type InventoryBambuBatchModalProps = {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  onClose: () => void;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  onRowSelectionChange: (rowKey: string, masterId: string | null) => void;
  open: boolean;
  tauriAvailable: boolean;
};

const CAMERA_READ_WARNING_THRESHOLD = 3;
const CAMERA_SCAN_INITIAL_DELAY_MS = 350;
const CAMERA_SCAN_INTERVAL_MS = 1200;
const CAMERA_DUPLICATE_RESET_EMPTY_FRAME_COUNT = 5;
const bambuBatchCodeFieldClassName =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
const bambuBatchSecondaryButtonClassName =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
const bambuBatchRowSelectClassName =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
const bambuBatchPanelClassName =
  "rounded-2xl border border-slate-200/90 bg-white/72 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45";
const bambuBatchScanPanelClassName = `shrink-0 p-3 ${bambuBatchPanelClassName}`;
const bambuBatchReviewPanelClassName = `flex min-h-0 flex-col ${bambuBatchPanelClassName}`;

function bambuBatchWorkspaceClassName(cameraPanelVisible: boolean): string {
  const desktopColumns = cameraPanelVisible
    ? "min-[900px]:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]"
    : "min-[900px]:grid-cols-[minmax(17rem,0.62fr)_minmax(0,1.38fr)]";
  return `grid min-h-0 grid-cols-1 gap-4 overflow-y-auto overscroll-contain min-[900px]:h-full min-[900px]:overflow-hidden xl:gap-5 ${desktopColumns}`;
}

type BambuBatchCameraScanModule = typeof import("../lib/bambu_filament_code_camera_scan");
type BambuBatchImageScanModule = typeof import("../lib/bambu_filament_code_image_scan");
type BambuBatchCameraDetector = Awaited<
  ReturnType<BambuBatchCameraScanModule["createBambuFilamentCodeCameraDetector"]>
>;

let bambuBatchCameraScanModulePromise: Promise<BambuBatchCameraScanModule> | null = null;
let bambuBatchImageScanModulePromise: Promise<BambuBatchImageScanModule> | null = null;

function loadBambuBatchCameraScanModule() {
  bambuBatchCameraScanModulePromise ??= import("../lib/bambu_filament_code_camera_scan");
  return bambuBatchCameraScanModulePromise;
}

function loadBambuBatchImageScanModule() {
  bambuBatchImageScanModulePromise ??= import("../lib/bambu_filament_code_image_scan");
  return bambuBatchImageScanModulePromise;
}

function bambuBatchRowStatusLabel(
  row: BambuFilamentCodeBatchRow,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (row.master) {
    return t("inventory.bambuBatchReady", "Ready");
  }
  if (row.lookup.status === "multiple_active") {
    return t("inventory.bambuBatchAmbiguous", "Choose manually");
  }
  if (row.lookup.status === "discontinued_only") {
    return row.lookup.discontinuedMatches.length > 1
      ? t("inventory.bambuBatchAmbiguous", "Choose manually")
      : t("common.discontinued", "Discontinued");
  }
  if (row.lookup.status === "no_match") {
    return t("inventory.bambuBatchNoMatch", "No match");
  }
  return t("inventory.bambuBatchNoCode", "No code");
}

function bambuBatchRowPreview(row: BambuFilamentCodeBatchRow): string {
  if (row.master) {
    return formatMasterDisplayTitle(row.master);
  }
  const matches =
    row.lookup.activeMatches.length > 0
      ? row.lookup.activeMatches
      : row.lookup.discontinuedMatches;
  if (matches.length === 0) {
    return row.sourceText;
  }
  const preview = matches
    .slice(0, 2)
    .map((master) => formatMasterDisplayTitle(master))
    .join(", ");
  return matches.length > 2 ? `${preview} +${matches.length - 2}` : preview;
}

function bambuBatchSelectionOptionLabel(
  master: BambuFilamentCodeBatchRow["selectionMatches"][number],
  t: ReturnType<typeof useI18n>["t"],
): string {
  const title = formatMasterDisplayTitle(master);
  return master.is_discontinued
    ? `${title} · ${t("common.discontinued", "Discontinued")}`
    : title;
}

function bambuBatchCreateStateMessage(
  state: BambuFilamentCodeBatchCreateState,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (state.totalCount === 0) {
    return null;
  }
  if (state.reason === "borrowed_owner_required") {
    return t(
      "inventory.bambuBatchBorrowedOwnerRequired",
      "Enter who the spools are borrowed from before creating this borrowed-in batch.",
    );
  }
  if (state.reason === "no_ready_rows") {
    return t(
      "inventory.bambuBatchNoneReady",
      "No rows are ready yet. Review ambiguous, discontinued or missing codes manually.",
    );
  }
  if (state.partial) {
    return t(
      "inventory.bambuBatchPartialReady",
      "Only ready rows will be added; review rows are skipped.",
    );
  }
  if (state.readyCount > 0) {
    return t("inventory.bambuBatchAllReady", "All pasted codes are ready.");
  }
  return null;
}

function bambuBatchImageScanMessage(
  append: {
    appendedCodeLines: string[];
    appendedReviewLines: string[];
    ignoredLines: string[];
  },
  t: ReturnType<typeof useI18n>["t"],
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  const ignoredCount = append.ignoredLines.length;
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedMixed",
      "{codeCount} filament code(s) and {reviewCount} barcode value(s) for review were added to the batch.",
      { codeCount, reviewCount },
    );
  }
  if (codeCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedCodes",
      "{count} filament code(s) added to the batch.",
      { count: codeCount },
    );
  }
  if (ignoredCount > 0) {
    return t(
      "inventory.bambuBatchImageIgnored",
      "Ignored {count} Bambu instruction QR value(s).",
      { count: ignoredCount },
    );
  }
  return t(
    "inventory.bambuBatchImageAddedReview",
    "{count} barcode value(s) added for review.",
    { count: reviewCount },
  );
}

function formatBambuBatchScanLinePreview(lines: string[]): string {
  const preview = lines.slice(0, 3).join(", ");
  const remainingCount = Math.max(0, lines.length - 3);
  return remainingCount > 0 ? `${preview} +${remainingCount}` : preview;
}

type BambuBatchCameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "added"
  | "review"
  | "duplicate"
  | "ignored"
  | "unsupported"
  | "error";

function bambuBatchCameraScanMessage(
  append: {
    appendedCodeLines: string[];
    appendedReviewLines: string[];
    ignoredLines: string[];
  },
  t: ReturnType<typeof useI18n>["t"],
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  const ignoredCount = append.ignoredLines.length;
  const codePreview = formatBambuBatchScanLinePreview(append.appendedCodeLines);
  const reviewPreview = formatBambuBatchScanLinePreview(append.appendedReviewLines);
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchCameraAddedMixedValues",
      "Added {codes}; {reviewCount} barcode value(s) for review.",
      { codes: codePreview, reviewCount },
    );
  }
  if (codeCount > 0) {
    return t("inventory.bambuBatchCameraAddedCodeValues", "Added {codes}.", {
      codes: codePreview,
    });
  }
  if (ignoredCount > 0) {
    return t(
      "inventory.bambuBatchCameraIgnoredQr",
      "Ignored a Bambu instruction QR. Keep showing the Filament Code label.",
    );
  }
  return t(
    "inventory.bambuBatchCameraAddedReviewValues",
    "Added for review: {values}.",
    { values: reviewPreview },
  );
}

function bambuBatchCameraStatusLabel(
  status: BambuBatchCameraStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (status === "starting") {
    return t("inventory.bambuBatchCameraStarting", "Starting camera");
  }
  if (status === "added") {
    return t("inventory.bambuBatchCameraAdded", "Added");
  }
  if (status === "review") {
    return t("inventory.bambuBatchCameraReview", "Review");
  }
  if (status === "duplicate") {
    return t("inventory.bambuBatchCameraDuplicate", "Already added");
  }
  if (status === "ignored") {
    return t("inventory.bambuBatchCameraIgnored", "Ignored");
  }
  if (status === "unsupported") {
    return t("inventory.bambuBatchCameraUnavailable", "Camera unavailable");
  }
  if (status === "error") {
    return t("inventory.bambuBatchCameraErrorShort", "Camera error");
  }
  return t("inventory.bambuBatchCameraScanning", "Scanning");
}

function bambuBatchCameraOverlayClassName(status: BambuBatchCameraStatus): string {
  if (status === "added" || status === "review") {
    return "border-emerald-300/50 bg-emerald-500/15 text-emerald-50";
  }
  if (status === "duplicate") {
    return "border-amber-300/50 bg-amber-500/15 text-amber-50";
  }
  if (status === "ignored") {
    return "border-white/20 bg-slate-950/60 text-slate-100";
  }
  if (status === "unsupported" || status === "error") {
    return "border-rose-300/50 bg-rose-500/15 text-rose-50";
  }
  return "border-white/20 bg-slate-950/45 text-white";
}

function BambuFilamentCodeBatchPanel({
  batch,
  createState,
  disabledCreate,
  input,
  onCreateBatch,
  onInputChange,
  onRowSelectionChange,
  tauriAvailable,
}: {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  onRowSelectionChange: (rowKey: string, masterId: string | null) => void;
  tauriAvailable: boolean;
}) {
  const { t } = useI18n();
  const batchInputId = useId();
  const [scanInput, setScanInput] = useState("");
  const [imageScanBusy, setImageScanBusy] = useState(false);
  const [imageScanMessage, setImageScanMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<BambuBatchCameraStatus>("idle");
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraScanModuleRef = useRef<BambuBatchCameraScanModule | null>(null);
  const detectorRef = useRef<BambuBatchCameraDetector | null>(null);
  const seenCameraKeysRef = useRef<Set<string>>(new Set());
  const emptyCameraFrameCountRef = useRef(0);
  const readErrorFrameCountRef = useRef(0);
  const scanBusyRef = useRef(false);
  const scanTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const inputRef = useRef(input);
  const mountedRef = useRef(true);
  const visibleRows = batch.rows.slice(0, 30);
  const hiddenCount = Math.max(0, batch.rows.length - visibleRows.length);
  const createMessage = bambuBatchCreateStateMessage(createState, t);
  const trimmedScanInput = scanInput.trim();
  const cameraPanelVisible = cameraActive || cameraStatus !== "idle";
  const cameraStarting = cameraStatus === "starting";

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const clearCameraTimers = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    clearCameraTimers();
    scanBusyRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;
    seenCameraKeysRef.current = new Set();
    emptyCameraFrameCountRef.current = 0;
    readErrorFrameCountRef.current = 0;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [clearCameraTimers]);

  const showCameraFeedback = useCallback(
    (
      status: BambuBatchCameraStatus,
      message: string,
      options: { sticky?: boolean } = {},
    ) => {
      setCameraStatus(status);
      setCameraMessage(message);
      if (typeof window === "undefined") {
        return;
      }
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      if (!options.sticky && ["added", "review", "duplicate"].includes(status)) {
        feedbackTimerRef.current = window.setTimeout(() => {
          setCameraStatus("scanning");
          setCameraMessage(
            t(
              "inventory.bambuBatchCameraShowLabel",
              "Show a Bambu box label to the camera.",
            ),
          );
          feedbackTimerRef.current = null;
        }, 1800);
      }
    },
    [t],
  );

  const scanCameraFrame = useCallback(async () => {
    if (scanBusyRef.current) {
      return;
    }
    const video = videoRef.current;
    const detector = detectorRef.current;
    const cameraScanModule = cameraScanModuleRef.current;
    if (!video || !detector || !cameraScanModule || video.readyState < 2) {
      return;
    }

    scanBusyRef.current = true;
    try {
      const frame = await cameraScanModule.scanBambuFilamentCodeCameraFrame({
        detector,
        videoFrame: video,
      });
      if (!mountedRef.current) {
        return;
      }
      if (frame.status === "no_barcode") {
        readErrorFrameCountRef.current = 0;
        emptyCameraFrameCountRef.current += 1;
        if (
          emptyCameraFrameCountRef.current >=
          CAMERA_DUPLICATE_RESET_EMPTY_FRAME_COUNT
        ) {
          seenCameraKeysRef.current = new Set();
        }
        if (
          emptyCameraFrameCountRef.current === 4 ||
          emptyCameraFrameCountRef.current % 10 === 0
        ) {
          showCameraFeedback(
            "scanning",
            t(
              "inventory.bambuBatchCameraNoBarcodeYet",
              "Scanning frames; no barcode match yet. Move closer or farther away until the bars are sharp.",
            ),
            { sticky: true },
          );
        }
        return;
      }

      emptyCameraFrameCountRef.current = 0;
      readErrorFrameCountRef.current = 0;
      const append = cameraScanModule.appendBambuFilamentCodeCameraScanValues({
        currentInput: inputRef.current,
        rawValues: frame.rawValues,
        seenKeys: seenCameraKeysRef.current,
      });
      seenCameraKeysRef.current = append.nextSeenKeys;

      if (append.status === "appended") {
        inputRef.current = append.input;
        onInputChange(append.input);
        showCameraFeedback(
          append.appendedCodeLines.length > 0 ? "added" : "review",
          bambuBatchCameraScanMessage(append, t),
        );
      } else if (append.status === "duplicate") {
        showCameraFeedback(
          "duplicate",
          t(
            "inventory.bambuBatchCameraAlreadyAdded",
            "Already added. Move the label away before scanning another copy.",
          ),
        );
      } else if (append.status === "ignored") {
        showCameraFeedback("ignored", bambuBatchCameraScanMessage(append, t));
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      console.error(error);
      readErrorFrameCountRef.current += 1;
      if (readErrorFrameCountRef.current >= CAMERA_READ_WARNING_THRESHOLD) {
        showCameraFeedback(
          "scanning",
          t(
            "inventory.bambuBatchCameraReadRetry",
            "Camera is still active, but the reader skipped a frame. Keep the label steady.",
          ),
          { sticky: true },
        );
      }
    } finally {
      scanBusyRef.current = false;
    }
  }, [onInputChange, showCameraFeedback, t]);

  useEffect(() => {
    if (!cameraActive || typeof window === "undefined") {
      return undefined;
    }

    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch((error) => {
        console.error(error);
        stopCameraStream();
        setCameraActive(false);
        showCameraFeedback(
          "error",
          t("inventory.bambuBatchCameraPreviewError", "Could not start camera preview."),
          { sticky: true },
        );
      });
    }

    const initialScanTimer = window.setTimeout(
      () => void scanCameraFrame(),
      CAMERA_SCAN_INITIAL_DELAY_MS,
    );
    scanTimerRef.current = window.setInterval(
      () => void scanCameraFrame(),
      CAMERA_SCAN_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(initialScanTimer);
      if (scanTimerRef.current !== null) {
        window.clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [cameraActive, scanCameraFrame, showCameraFeedback, stopCameraStream, t]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const stopCamera = useCallback(() => {
    stopCameraStream();
    setCameraActive(false);
    setCameraStatus("idle");
    setCameraMessage(null);
  }, [stopCameraStream]);

  const startCamera = useCallback(async () => {
    if (!tauriAvailable || cameraStarting) {
      return;
    }

    stopCameraStream();
    setCameraStatus("starting");
    setCameraMessage(t("inventory.bambuBatchCameraStartingMessage", "Starting camera..."));

    try {
      const cameraScanModule = await loadBambuBatchCameraScanModule();
      cameraScanModuleRef.current = cameraScanModule;

      const support = cameraScanModule.bambuFilamentCodeCameraScanSupport();
      if (!support.available) {
        setCameraStatus("unsupported");
        setCameraMessage(
          t(
            "inventory.bambuBatchCameraUnsupported",
            "Camera access is not available here. Use image import or type the code instead.",
          ),
        );
        return;
      }

      const detector = await cameraScanModule.createBambuFilamentCodeCameraDetector();
      if (!mountedRef.current) {
        return;
      }
      if (!detector) {
        setCameraStatus("unsupported");
        setCameraMessage(
          t(
            "inventory.bambuBatchCameraBarcodeUnsupported",
            "Live barcode detection is not available here. Use image import or type the code instead.",
          ),
        );
        return;
      }

      const stream = await cameraScanModule.requestBambuFilamentCodeCameraStream();
      if (!mountedRef.current) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream) {
        setCameraStatus("unsupported");
        setCameraMessage(
          t(
            "inventory.bambuBatchCameraUnsupported",
            "Camera access is not available here. Use image import or type the code instead.",
          ),
        );
        return;
      }

      detectorRef.current = detector;
      streamRef.current = stream;
      seenCameraKeysRef.current = new Set();
      emptyCameraFrameCountRef.current = 0;
      readErrorFrameCountRef.current = 0;
      setCameraActive(true);
      showCameraFeedback(
        "scanning",
        t("inventory.bambuBatchCameraShowLabel", "Show a Bambu box label to the camera."),
        { sticky: true },
      );
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      console.error(error);
      stopCameraStream();
      setCameraActive(false);
      const errorName = error instanceof Error ? error.name : "";
      setCameraStatus("error");
      setCameraMessage(
        errorName === "NotAllowedError" || errorName === "PermissionDeniedError"
          ? t(
              "inventory.bambuBatchCameraPermissionDenied",
              "Camera permission was denied. Allow camera access and try again.",
            )
          : t("inventory.bambuBatchCameraError", "Could not start the camera."),
      );
    }
  }, [cameraStarting, showCameraFeedback, stopCameraStream, tauriAvailable, t]);

  const appendScanInput = () => {
    const append = appendBambuFilamentCodeBatchScanInput({
      currentInput: input,
      scanText: scanInput,
    });
    if (append.appendedLines.length === 0) {
      return;
    }
    onInputChange(append.input);
    setScanInput("");
  };

  const handleImageScan = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0] ?? null;
    if (!file) {
      return;
    }

    setImageScanBusy(true);
    setImageScanMessage(t("inventory.bambuBatchImageScanning", "Reading image..."));
    try {
      const imageScanModule = await loadBambuBatchImageScanModule();
      const result = await imageScanModule.scanBambuFilamentCodesFromImage({
        currentInput: input,
        file,
      });
      if (result.status === "ready") {
        onInputChange(result.append.input);
        setImageScanMessage(bambuBatchImageScanMessage(result.append, t));
      } else if (result.status === "unsupported") {
        setImageScanMessage(
          t(
            "inventory.bambuBatchImageUnsupported",
            "Image barcode detection is not available here. Paste or type the code instead.",
          ),
        );
      } else {
        setImageScanMessage(
          t("inventory.bambuBatchImageNoBarcode", "No barcode was found in that image."),
        );
      }
    } catch (error) {
      console.error(error);
      setImageScanMessage(
        t("inventory.bambuBatchImageError", "Could not read that image."),
      );
    } finally {
      setImageScanBusy(false);
      inputElement.value = "";
    }
  };

  return (
    <div className={bambuBatchWorkspaceClassName(cameraPanelVisible)}>
      <section className="flex min-h-0 flex-col gap-3 min-[900px]:overflow-hidden">
        <div className={bambuBatchScanPanelClassName}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {t("inventory.bambuBatchScanTitle", "Scan or enter codes")}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.bambuBatchScanHelp",
                  "Use the webcam, image import, or type one code at a time.",
                )}
              </div>
            </div>
            {cameraPanelVisible ? (
              <span
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${bambuBatchCameraOverlayClassName(
                  cameraStatus,
                )}`}
              >
                {bambuBatchCameraStatusLabel(cameraStatus, t)}
              </span>
            ) : null}
          </div>

          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              appendScanInput();
            }}
          >
            <input
              type="text"
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              placeholder={t("inventory.bambuBatchScanPlaceholder", "Scan or type one code")}
              aria-label={t("inventory.bambuBatchScanLabel", "Scan or type one code")}
              className={`min-w-0 flex-1 ${bambuBatchCodeFieldClassName}`}
              disabled={!tauriAvailable}
            />
            <button
              type="submit"
              className={bambuBatchSecondaryButtonClassName}
              disabled={!tauriAvailable || !trimmedScanInput}
            >
              {t("inventory.bambuBatchAppendScan", "Add to batch")}
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label
              className={`cursor-pointer ${bambuBatchSecondaryButtonClassName} ${
                !tauriAvailable || imageScanBusy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleImageScan(event)}
                disabled={!tauriAvailable || imageScanBusy}
              />
              {imageScanBusy
                ? t("inventory.bambuBatchImageScanning", "Reading image...")
                : t("inventory.bambuBatchImageAction", "Add from image")}
            </label>
            <button
              type="button"
              className={bambuBatchSecondaryButtonClassName}
              onClick={cameraActive ? stopCamera : () => void startCamera()}
              disabled={!tauriAvailable || cameraStarting}
            >
              {cameraActive
                ? t("inventory.bambuBatchCameraStop", "Stop webcam")
                : cameraStarting
                  ? t("inventory.bambuBatchCameraStartingAction", "Starting camera...")
                  : t("inventory.bambuBatchCameraAction", "Use webcam")}
            </button>
            {imageScanMessage ? (
              <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                {imageScanMessage}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={`min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700 ${
            cameraPanelVisible ? "flex-1" : "hidden"
          }`}
        >
          <div className="relative h-full min-h-[18rem] bg-slate-950 min-[900px]:min-h-0">
            {cameraPanelVisible ? (
              <>
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full bg-slate-950 object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-5 text-center text-sm text-slate-400">
                    {cameraMessage ??
                      t(
                        "inventory.bambuBatchCameraPreviewIdle",
                        "Start the webcam to scan Bambu box labels.",
                      )}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-5 rounded-2xl border border-white/30" />
                <div className="pointer-events-none absolute left-[8%] right-[8%] top-[42%] h-[16%] rounded-xl border border-white/45 bg-white/[0.03] shadow-[0_0_24px_rgba(255,255,255,0.12)]" />
                <div className="pointer-events-none absolute left-8 right-8 top-1/2 h-px bg-white/20" />
                <div className="pointer-events-none absolute bottom-8 top-8 left-1/2 w-px bg-white/20" />
                <div
                  className={`pointer-events-none absolute inset-x-3 bottom-3 rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg shadow-slate-950/30 ${bambuBatchCameraOverlayClassName(
                    cameraStatus,
                  )}`}
                  aria-live="polite"
                >
                  {cameraMessage ??
                    t(
                      "inventory.bambuBatchCameraShowLabel",
                      "Show a Bambu box label to the camera.",
                    )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <aside className={bambuBatchReviewPanelClassName}>
        <div className="shrink-0 border-b border-slate-200/80 p-3 dark:border-slate-800/70">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {t("inventory.bambuBatchTitle", "Batch Filament Codes")}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.bambuBatchHelp",
                  "Paste one or more five digit codes. Ready matches use the stock details from Add filament.",
                )}
              </div>
            </div>
            {batch.rows.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold tabular-nums">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {batch.creatableRows.length}{" "}
                  {t("inventory.bambuBatchReadyShort", "ready")}
                </span>
                {batch.blockedRows.length > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                    {batch.blockedRows.length}{" "}
                    {t("inventory.bambuBatchNeedsReview", "review")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {createMessage ? (
            <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {createMessage}
            </div>
          ) : null}
        </div>

        <ModalBody overscrollContain className="p-3">
          <label
            htmlFor={batchInputId}
            className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {t("inventory.bambuBatchInputLabel", "Codes in this batch")}
          </label>
          <textarea
            id={batchInputId}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={t("inventory.bambuBatchPlaceholder", "53400\n53600\n65103")}
            rows={3}
            className={`w-full resize-y ${bambuBatchCodeFieldClassName}`}
            disabled={!tauriAvailable}
          />

          {batch.rows.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {visibleRows.map((row) => {
                const ready = Boolean(row.master);
                const selectable = row.selectionMatches.length > 1;
                return (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/55"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                        {row.code ?? row.sourceText}
                      </div>
                      <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {bambuBatchRowPreview(row)}
                      </div>
                      {selectable ? (
                        <label className="mt-2 block">
                          <span className="sr-only">
                            {t(
                              "inventory.bambuBatchChooseMatch",
                              "Choose catalog row",
                            )}
                          </span>
                          <select
                            value={row.master?.id ?? ""}
                            onChange={(event) =>
                              onRowSelectionChange(row.key, event.currentTarget.value || null)
                            }
                            className={bambuBatchRowSelectClassName}
                            disabled={!tauriAvailable}
                          >
                            <option value="">
                              {t(
                                "inventory.bambuBatchChooseMatch",
                                "Choose catalog row",
                              )}
                            </option>
                            {row.selectionMatches.map((master) => (
                              <option key={master.id} value={master.id}>
                                {bambuBatchSelectionOptionLabel(master, t)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        ready
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                      }`}
                    >
                      {bambuBatchRowStatusLabel(row, t)}
                    </span>
                  </div>
                );
              })}
              {hiddenCount > 0 ? (
                <div className="px-1 text-xs text-slate-500 dark:text-slate-400">
                  +{hiddenCount} {t("inventory.bambuBatchMoreRows", "more")}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t(
                "inventory.bambuBatchNoRowsYet",
                "Scanned and typed codes will appear here.",
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="p-3">
          <ModalActionButton
            type="button"
            fullWidth
            variant="solid"
            size="roomy"
            onClick={onCreateBatch}
            disabled={disabledCreate}
          >
            {t("inventory.bambuBatchAddReady", "Add ready matches")} ·{" "}
            {batch.creatableRows.length}
          </ModalActionButton>
        </ModalFooter>
      </aside>
    </div>
  );
}

export function InventoryBambuBatchModal({
  batch,
  createState,
  disabledCreate,
  input,
  onClose,
  onCreateBatch,
  onInputChange,
  onRowSelectionChange,
  open,
  tauriAvailable,
}: InventoryBambuBatchModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const modal = (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={`${inventoryWideModalPanelClassName} overscroll-contain`}
      zIndex={60}
    >
      <>
        <ModalHeader
          eyebrow={t("inventory.bambuBatchModalEyebrow", "Bambu boxes")}
          title={t("inventory.bambuBatchModalTitle", "Batch add from boxes")}
          subtitle={t(
            "inventory.bambuBatchModalSubtitle",
            "Add several Bambu rolls from box Filament Codes without moving the normal catalog search out of view.",
          )}
          closeLabel={t("common.close", "Close")}
          onClose={onClose}
          className="py-2.5"
          titleClassName="text-lg"
          subtitleClassName="max-w-3xl text-xs leading-4"
        />

        <ModalBody scroll={false} className="px-3 py-3 sm:px-4">
          <BambuFilamentCodeBatchPanel
            batch={batch}
            createState={createState}
            disabledCreate={disabledCreate}
            input={input}
            onCreateBatch={onCreateBatch}
            onInputChange={onInputChange}
            onRowSelectionChange={onRowSelectionChange}
            tauriAvailable={tauriAvailable}
          />
        </ModalBody>
      </>
    </AppModal>
  );

  if (typeof document === "undefined") {
    return modal;
  }

  return createPortal(modal, document.body);
}

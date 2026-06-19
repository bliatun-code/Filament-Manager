import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AppModal } from "./app_modal";
import { inventoryModalOverlayClassName } from "./inventory_modal_chrome";
import { ModalHeader } from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
  BambuFilamentCodeBatchRow,
} from "../lib/bambu_filament_code_batch";
import { appendBambuFilamentCodeBatchScanInput } from "../lib/bambu_filament_code_batch";
import {
  appendBambuFilamentCodeCameraScanValues,
  bambuFilamentCodeCameraScanSupport,
  createBambuFilamentCodeCameraDetector,
  requestBambuFilamentCodeCameraStream,
  scanBambuFilamentCodeCameraFrame,
} from "../lib/bambu_filament_code_camera_scan";
import { scanBambuFilamentCodesFromImage } from "../lib/bambu_filament_code_image_scan";
import type { BambuFilamentCodeLookup } from "../lib/bambu_filament_code_lookup";
import { formatMasterDisplayTitle } from "../lib/inventory_list_model";

type InventoryBambuBatchModalProps = {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  lookup: BambuFilamentCodeLookup;
  onClose: () => void;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  open: boolean;
  tauriAvailable: boolean;
};

const CAMERA_READ_WARNING_THRESHOLD = 3;

function BambuFilamentCodeLookupHint({
  lookup,
}: {
  lookup: BambuFilamentCodeLookup;
}) {
  const { t } = useI18n();

  const displayMatches =
    lookup.activeMatches.length > 0 ? lookup.activeMatches : lookup.discontinuedMatches;
  const matchPreview = displayMatches
    .slice(0, 3)
    .map((master) => formatMasterDisplayTitle(master))
    .join(", ");
  const remainingCount = Math.max(0, displayMatches.length - 3);

  let message = t(
    "inventory.bambuCodeHelp",
    "Use the five digit code printed as Filament Code on the Bambu box label.",
  );
  if (lookup.status === "no_match") {
    message = t(
      "inventory.bambuCodeNoMatch",
      "No Bambu catalog entry uses this filament code yet.",
    );
  } else if (lookup.status === "single_active") {
    message = t(
      "inventory.bambuCodeSingleMatch",
      "One active Bambu catalog entry matched and is selected.",
    );
  } else if (lookup.status === "multiple_active") {
    message = t(
      "inventory.bambuCodeMultipleMatches",
      "This code is used by several active Bambu catalog entries. Choose the correct row.",
    );
  } else if (lookup.status === "discontinued_only") {
    message = t(
      "inventory.bambuCodeDiscontinuedOnly",
      "Only discontinued Bambu catalog entries use this code.",
    );
  }

  return (
    <div
      className="rounded-2xl border border-slate-200/90 bg-white/72 p-3 text-xs text-slate-600 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45 dark:text-slate-300"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-none text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 sm:w-44">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em]">
              {t("inventory.bambuCodeBoxLabelTitle", "Box label")}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              Bambu
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 dark:bg-slate-950/80">
              <span>{t("inventory.material", "Material")}</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">PLA</span>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 ring-2 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-950/80 dark:ring-white/10">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.16em]">
                {t("inventory.bambuCodeLabel", "Filament Code")}
              </span>
              <span className="mt-1 block font-mono text-lg font-semibold tracking-normal text-slate-900 dark:text-slate-50">
                {lookup.code ?? "53400"}
              </span>
            </div>
            <div className="flex h-5 items-end gap-0.5 rounded-md bg-white px-2 py-1 dark:bg-slate-950/80">
              {[3, 1, 2, 4, 1, 3, 2].map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="w-0.5 rounded-full bg-slate-400 dark:bg-slate-500"
                  style={{ height: `${height * 3}px` }}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            {t("inventory.bambuCodeBoxLabelHint", "Find this field on the box label.")}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 dark:text-slate-100">{message}</div>
          {matchPreview ? (
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              {matchPreview}
              {remainingCount > 0
                ? ` +${remainingCount} ${t("inventory.bambuCodeMoreMatches", "more")}`
                : ""}
            </div>
          ) : (
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              {lookup.code
                ? t(
                    "inventory.bambuCodeTryCatalogSearch",
                    "You can still search by material, series, or color name.",
                  )
                : t(
                    "inventory.bambuCodeEnterExample",
                    "Type the code into the search field, for example 53400.",
                  )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
    return t("common.discontinued", "Discontinued");
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
  append: { appendedCodeLines: string[]; appendedReviewLines: string[] },
  t: ReturnType<typeof useI18n>["t"],
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedMixed",
      "{codeCount} filament code(s) and {reviewCount} barcode value(s) for review were added to the batch.",
    )
      .replace("{codeCount}", String(codeCount))
      .replace("{reviewCount}", String(reviewCount));
  }
  if (codeCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedCodes",
      "{count} filament code(s) added to the batch.",
    ).replace("{count}", String(codeCount));
  }
  return t(
    "inventory.bambuBatchImageAddedReview",
    "{count} barcode value(s) added for review.",
  ).replace("{count}", String(reviewCount));
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
  | "unsupported"
  | "error";

function bambuBatchCameraScanMessage(
  append: { appendedCodeLines: string[]; appendedReviewLines: string[] },
  t: ReturnType<typeof useI18n>["t"],
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  const codePreview = formatBambuBatchScanLinePreview(append.appendedCodeLines);
  const reviewPreview = formatBambuBatchScanLinePreview(append.appendedReviewLines);
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchCameraAddedMixedValues",
      "Added {codes}; {reviewCount} barcode value(s) for review.",
    )
      .replace("{codes}", codePreview)
      .replace("{reviewCount}", String(reviewCount));
  }
  if (codeCount > 0) {
    return t(
      "inventory.bambuBatchCameraAddedCodeValues",
      "Added {codes}.",
    ).replace("{codes}", codePreview);
  }
  return t(
    "inventory.bambuBatchCameraAddedReviewValues",
    "Added for review: {values}.",
  ).replace("{values}", reviewPreview);
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
  tauriAvailable,
}: {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  tauriAvailable: boolean;
}) {
  const { t } = useI18n();
  const [scanInput, setScanInput] = useState("");
  const [imageScanBusy, setImageScanBusy] = useState(false);
  const [imageScanMessage, setImageScanMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<BambuBatchCameraStatus>("idle");
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Awaited<
    ReturnType<typeof createBambuFilamentCodeCameraDetector>
  > | null>(null);
  const seenCameraKeysRef = useRef<Set<string>>(new Set());
  const emptyCameraFrameCountRef = useRef(0);
  const readErrorFrameCountRef = useRef(0);
  const scanBusyRef = useRef(false);
  const scanTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const inputRef = useRef(input);
  const mountedRef = useRef(true);
  const visibleRows = batch.rows.slice(0, 6);
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
    if (!video || !detector || video.readyState < 2) {
      return;
    }

    scanBusyRef.current = true;
    try {
      const frame = await scanBambuFilamentCodeCameraFrame({
        detector,
        videoFrame: video,
      });
      if (!mountedRef.current) {
        return;
      }
      if (frame.status === "no_barcode") {
        readErrorFrameCountRef.current = 0;
        emptyCameraFrameCountRef.current += 1;
        if (emptyCameraFrameCountRef.current >= 3) {
          seenCameraKeysRef.current = new Set();
        }
        return;
      }

      emptyCameraFrameCountRef.current = 0;
      readErrorFrameCountRef.current = 0;
      const append = appendBambuFilamentCodeCameraScanValues({
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

    const initialScanTimer = window.setTimeout(() => void scanCameraFrame(), 250);
    scanTimerRef.current = window.setInterval(() => void scanCameraFrame(), 650);

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

    const support = bambuFilamentCodeCameraScanSupport();
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

    try {
      const detector = await createBambuFilamentCodeCameraDetector();
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

      const stream = await requestBambuFilamentCodeCameraStream();
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
      const result = await scanBambuFilamentCodesFromImage({
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
    <div className="rounded-2xl border border-slate-200/90 bg-white/72 p-4 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
              {batch.creatableRows.length} {t("inventory.bambuBatchReadyShort", "ready")}
            </span>
            {batch.blockedRows.length > 0 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                {batch.blockedRows.length} {t("inventory.bambuBatchNeedsReview", "review")}
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
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500"
          disabled={!tauriAvailable}
        />
        <button
          type="submit"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
          disabled={!tauriAvailable || !trimmedScanInput}
        >
          {t("inventory.bambuBatchAppendScan", "Add to batch")}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80 ${
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
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
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

      {cameraPanelVisible ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700">
          <div className="relative aspect-video min-h-48 bg-slate-950">
            {cameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
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
            <div className="pointer-events-none absolute left-8 right-8 top-1/2 h-px bg-white/20" />
            <div className="pointer-events-none absolute bottom-8 top-8 left-1/2 w-px bg-white/20" />
            <div
              className={`pointer-events-none absolute left-3 top-3 rounded-full border px-3 py-1 text-xs font-semibold shadow-lg shadow-slate-950/30 ${bambuBatchCameraOverlayClassName(
                cameraStatus,
              )}`}
            >
              {bambuBatchCameraStatusLabel(cameraStatus, t)}
            </div>
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
          </div>
        </div>
      ) : null}

      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder={t("inventory.bambuBatchPlaceholder", "53400\n53600\n65103")}
        rows={4}
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500"
        disabled={!tauriAvailable}
      />

      {batch.rows.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {visibleRows.map((row) => {
            const ready = Boolean(row.master);
            return (
              <div
                key={row.key}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/55"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {row.code ?? row.sourceText}
                  </div>
                  <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {bambuBatchRowPreview(row)}
                  </div>
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
      ) : null}

      <button
        type="button"
        className="mt-3 w-full rounded-xl border border-slate-900 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        onClick={onCreateBatch}
        disabled={disabledCreate}
      >
        {t("inventory.bambuBatchAddReady", "Add ready matches")} ·{" "}
        {batch.creatableRows.length}
      </button>
    </div>
  );
}

export function InventoryBambuBatchModal({
  batch,
  createState,
  disabledCreate,
  input,
  lookup,
  onClose,
  onCreateBatch,
  onInputChange,
  open,
  tauriAvailable,
}: InventoryBambuBatchModalProps) {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={modalPanelClassName("xl", "flex max-h-[90vh] min-h-0 flex-col p-0")}
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
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <BambuFilamentCodeLookupHint lookup={lookup} />
            <BambuFilamentCodeBatchPanel
              batch={batch}
              createState={createState}
              disabledCreate={disabledCreate}
              input={input}
              onCreateBatch={onCreateBatch}
              onInputChange={onInputChange}
              tauriAvailable={tauriAvailable}
            />
          </div>
        </div>
      </>
    </AppModal>
  );
}

import type {
  DiagnosticCaptureField,
  DiagnosticCaptureSession,
  DiagnosticChartFieldOption,
} from "./diagnostic_capture";

export function isDiagnosticChartFieldCandidate(field: DiagnosticCaptureField): boolean {
  const path = field.path.trim().toLowerCase();
  const numericValue = Number.parseFloat(field.valueText);
  if (!Number.isFinite(numericValue) || field.receiveCount < 2 || field.changeCount < 2) {
    return false;
  }
  if (
    /(sequence_id|^msg$|^command$|_uuid|tag_uid|chip_id|tray_weight|total_len|tray_diameter|tray_time|bed_temp_type|nozzle_temp_min|nozzle_temp_max|tray_info_idx|tray_id_name|home_flag|\.id$|^id$)/.test(
      path,
    )
  ) {
    return false;
  }
  return /(temper|temp|percent|remaining_time|humidity_raw|speed|layer_num|remain|fan)/.test(path);
}

export function buildDiagnosticChartFieldOptions(
  fields: DiagnosticCaptureField[],
): DiagnosticChartFieldOption[] {
  return fields
    .filter(isDiagnosticChartFieldCandidate)
    .sort((left, right) => {
      if (right.changeCount !== left.changeCount) {
        return right.changeCount - left.changeCount;
      }
      if (right.receiveCount !== left.receiveCount) {
        return right.receiveCount - left.receiveCount;
      }
      return left.path.localeCompare(right.path, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    })
    .map((field) => ({
      path: field.path,
      label: field.path,
    }));
}

export function buildDiagnosticChartPoints(
  session: DiagnosticCaptureSession | null,
  fieldPath: string | null,
): Array<{ observedAt: string; value: number; valueText: string }> {
  if (!session || !fieldPath) {
    return [];
  }
  return session.samples
    .filter((sample) => sample.fieldPath === fieldPath)
    .map((sample) => {
      const value = Number.parseFloat(sample.valueText);
      return Number.isFinite(value)
        ? {
            observedAt: sample.observedAt,
            value,
            valueText: sample.valueText,
          }
        : null;
    })
    .filter((point): point is { observedAt: string; value: number; valueText: string } => point != null);
}

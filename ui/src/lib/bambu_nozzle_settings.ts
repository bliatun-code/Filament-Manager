export function saneNozzleSettingTemp(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 400
    ? value
    : null;
}


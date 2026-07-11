export type InventoryLabelSheetPaperId = "a4" | "letter";

export type InventoryLabelSheetPaperProfile = {
  id: InventoryLabelSheetPaperId;
  title: string;
  widthMm: number;
  heightMm: number;
};

export type InventoryLabelSheetItem = {
  reference: string;
  pngDataUrl: string;
};

export type InventoryLabelSheetLayout = {
  paper: InventoryLabelSheetPaperProfile;
  labelWidthMm: number;
  labelHeightMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
  columns: number;
  rows: number;
  itemsPerPage: number;
  offsetXmm: number;
  offsetYmm: number;
  contentWidthMm: number;
  contentHeightMm: number;
};

export const INVENTORY_LABEL_SHEET_PAPER_PROFILES: readonly InventoryLabelSheetPaperProfile[] = [
  {
    id: "a4",
    title: "A4",
    widthMm: 210,
    heightMm: 297,
  },
  {
    id: "letter",
    title: "US Letter",
    widthMm: 215.9,
    heightMm: 279.4,
  },
] as const;

const LABEL_WIDTH_MM = 60;
const LABEL_HEIGHT_MM = 24;
const MINIMUM_MARGIN_MM = 8;
const HORIZONTAL_GAP_MM = 3;
const VERTICAL_GAP_MM = 2;

export function inventoryLabelSheetPaperProfile(
  paperId: InventoryLabelSheetPaperId,
): InventoryLabelSheetPaperProfile {
  return (
    INVENTORY_LABEL_SHEET_PAPER_PROFILES.find((profile) => profile.id === paperId) ??
    INVENTORY_LABEL_SHEET_PAPER_PROFILES[0]
  );
}

export function inventoryLabelSheetLayout(
  paperId: InventoryLabelSheetPaperId,
): InventoryLabelSheetLayout {
  const paper = inventoryLabelSheetPaperProfile(paperId);
  const printableWidthMm = paper.widthMm - MINIMUM_MARGIN_MM * 2;
  const printableHeightMm = paper.heightMm - MINIMUM_MARGIN_MM * 2;
  const columns = Math.floor(
    (printableWidthMm + HORIZONTAL_GAP_MM) / (LABEL_WIDTH_MM + HORIZONTAL_GAP_MM),
  );
  const rows = Math.floor(
    (printableHeightMm + VERTICAL_GAP_MM) / (LABEL_HEIGHT_MM + VERTICAL_GAP_MM),
  );
  if (columns < 1 || rows < 1) {
    throw new Error(`Paper ${paper.title} is too small for the inventory label.`);
  }

  const contentWidthMm = columns * LABEL_WIDTH_MM + (columns - 1) * HORIZONTAL_GAP_MM;
  const contentHeightMm = rows * LABEL_HEIGHT_MM + (rows - 1) * VERTICAL_GAP_MM;

  return {
    paper,
    labelWidthMm: LABEL_WIDTH_MM,
    labelHeightMm: LABEL_HEIGHT_MM,
    horizontalGapMm: HORIZONTAL_GAP_MM,
    verticalGapMm: VERTICAL_GAP_MM,
    columns,
    rows,
    itemsPerPage: columns * rows,
    offsetXmm: (paper.widthMm - contentWidthMm) / 2,
    offsetYmm: (paper.heightMm - contentHeightMm) / 2,
    contentWidthMm,
    contentHeightMm,
  };
}

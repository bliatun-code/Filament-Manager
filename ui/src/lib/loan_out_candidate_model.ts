import type { LoanableSpool } from "./loan_out_data_source";

export function filterLoanableSpoolsBySearch(
  spools: LoanableSpool[],
  search: string,
): LoanableSpool[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return spools;
  }

  return spools.filter((spool) => {
    const searchable = [
      spool.id,
      `#${spool.id}`,
      spool.vendor,
      spool.material,
      spool.filamentName,
      spool.colorName,
      spool.location ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

type ContainedScrollMetrics = {
  containerBottom: number;
  containerTop: number;
  currentScrollTop: number;
  rowBottom: number;
  rowTop: number;
};

export function resolveContainedSelectionScrollTop({
  containerBottom,
  containerTop,
  currentScrollTop,
  rowBottom,
  rowTop,
}: ContainedScrollMetrics): number {
  if (rowTop < containerTop) {
    return Math.max(0, currentScrollTop - (containerTop - rowTop));
  }
  if (rowBottom > containerBottom) {
    return currentScrollTop + (rowBottom - containerBottom);
  }
  return currentScrollTop;
}

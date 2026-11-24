import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PrinterPickerPage, PrinterPickerQuery } from "./tauri_printer_client";

export const PRINTER_PICKER_PAGE_SIZE = 120;

export type ReadPrinterPickerPage = (
  query: PrinterPickerQuery, isCurrent: () => boolean,
) => Promise<PrinterPickerPage | null>;
export const PrinterPickerPageContext = createContext<ReadPrinterPickerPage | null>(null);

export function usePrinterPickerPage(slotId: string, search: string, open: boolean, fallback: () => void) {
  const read = useContext(PrinterPickerPageContext);
  const term = search.trim();
  const key = useMemo(() => ({ read, term, slotId }), [read, term, slotId]);
  const [saved, setSaved] = useState<{ key: typeof key; page: PrinterPickerPage } | null>(null);
  const page = saved?.key === key ? saved.page : null;
  const [requestedOffset, setRequestedOffset] = useState<{ key: typeof key; offset: number } | null>(null);
  const offset = requestedOffset?.key === key ? requestedOffset.offset : 0;
  const [failedKey, setFailedKey] = useState<typeof key | null>(null);
  const lastSearch = useRef(0);
  const active = useRef(0);
  useLayoutEffect(() => {
    active.current += 1;
    return () => { active.current += 1; };
  }, [key, open, offset]);

  useEffect(() => {
    if (!open) {
      setSaved(null);
      setRequestedOffset(null);
      setFailedKey(null);
      return;
    }
    if (!read || (page && (page.rows.length > offset || page.rows.length >= page.total))) return;
    const generation = active.current;
    let cancelled = false;
    const current = () => !cancelled && active.current === generation;
    const fetchPage = read;
    async function load() {
      try {
        if (term && !offset) lastSearch.current = Date.now();
        const next = await fetchPage({ slot_id: slotId, search: term, offset }, current);
        if (!current()) return;
        if (!next || !Array.isArray(next.rows)) {
          fallback();
          return;
        }
        if (offset && (!page || next.revisions.some((value, i) => value !== page.revisions[i]))) {
          setSaved(null);
          setRequestedOffset(null);
          return;
        }
        setSaved({ key, page: offset && page ? { ...next, rows: [...page.rows, ...next.rows] } : next });
      } catch {
        if (current()) setFailedKey(key);
      }
    }
    // A typed search always covers the full library. Coalesce edits before contacting the Host.
    const timer = term && !offset && Date.now() - lastSearch.current < 150
      ? setTimeout(() => void load(), 100) : null;
    if (!timer) void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [open, read, key, slotId, term, offset, page, fallback]);

  return {
    enabled: !!read, page, failed: failedKey === key,
    more: () => { if (page && page.rows.length < page.total) setRequestedOffset({ key, offset: page.rows.length }); },
  };
}

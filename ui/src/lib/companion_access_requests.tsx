import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isTauri } from "./tauri_invoke";
import { listCompanionAccessRequests, decideCompanionAccessRequest, type CompanionAccessRequest } from "./tauri_companion_access_client";
import { useDocumentVisiblePolling } from "./use_document_visible_polling";


export function useCompanionAccessRequestState() {
  const [requests, setRequests] = useState<CompanionAccessRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const mounted = useRef(true);
  const refreshGeneration = useRef(0);
  const deciding = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const generation=++refreshGeneration.current;
    try {
      const rows = await listCompanionAccessRequests();
      if (mounted.current && generation===refreshGeneration.current) setRequests(rows);
      return true;
    } catch {
      if (mounted.current && generation===refreshGeneration.current) setRequests([]);
      return false;
    }
  }, []);
  useDocumentVisiblePolling({ enabled:isTauri(), intervalMs:5_000, runImmediately:true, poll:refresh });
  const decide = async (requestId:string, approve:boolean) => {
    if (deciding.current) return;
    deciding.current=true;
    refreshGeneration.current++;
    setBusy(true);setFailed(false);
    try {
      const row = await decideCompanionAccessRequest(requestId,approve);
      refreshGeneration.current++;
      if (mounted.current) setRequests(rows => approve ? rows.map(r=>r.id===row.id?row:r) : rows.filter(r=>r.id!==row.id));
      await refresh();
    } catch { if (mounted.current) setFailed(true); }
    finally { deciding.current=false; if (mounted.current) setBusy(false); }
  };
  return { requests, busy, failed, decide, reviewRequested, setReviewRequested };
}

export const CompanionAccessRequestsContext = createContext<ReturnType<typeof useCompanionAccessRequestState> | null>(null);
export function useCompanionAccessRequests() { return useContext(CompanionAccessRequestsContext); }

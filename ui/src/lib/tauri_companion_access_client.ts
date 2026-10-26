import { invoke } from "./tauri_invoke";

export type CompanionAccessRequest = {
  id: string;
  device_name: string;
  browser_hint: string;
  status: "pending" | "approved" | "rejected";
  requested_at_ms: number;
  expires_at_ms: number;
  confirmation_code: string | null;
};
export function listCompanionAccessRequests() { return invoke<CompanionAccessRequest[]>("list_companion_access_requests"); }
export function decideCompanionAccessRequest(requestId:string,approve:boolean) { return invoke<CompanionAccessRequest>("decide_companion_access_request",{requestId,approve}); }

export type InventoryCreateSuccess = Readonly<{ spoolId: string; message: string }>;

export type InventoryCreateSession = Readonly<{
  authorityKey: string;
  sessionId: number;
  receipt: InventoryCreateSuccess | null;
}>;

type InventoryCreateSessionAction =
  | { type: "reset" }
  | { type: "authority"; authorityKey: string }
  | { type: "completed"; authorityKey: string; sessionId: number; receipt: InventoryCreateSuccess };

export function newInventoryCreateSession(authorityKey: string): InventoryCreateSession {
  return { authorityKey, sessionId: 0, receipt: null };
}

export function inventoryCreateSessionReducer(
  state: InventoryCreateSession,
  action: InventoryCreateSessionAction,
): InventoryCreateSession {
  if (action.type === "completed") {
    return action.authorityKey === state.authorityKey && action.sessionId === state.sessionId
      ? { ...state, receipt: action.receipt }
      : state;
  }
  if (action.type === "authority" && action.authorityKey === state.authorityKey) return state;
  return {
    authorityKey: action.type === "authority" ? action.authorityKey : state.authorityKey,
    sessionId: state.sessionId + 1,
    receipt: null,
  };
}

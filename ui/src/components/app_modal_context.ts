import { createContext, useContext } from "react";

export const AppModalTitleIdContext = createContext<string | null>(null);

export function useAppModalTitleId(): string | undefined {
  return useContext(AppModalTitleIdContext) ?? undefined;
}

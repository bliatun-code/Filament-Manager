import { useEffect, useRef } from "react";
import { SettingsNotice } from "./settings_ui";

export function SettingsBackupActionFeedback({ error, info }: { error: string | null; info: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const message = error || info;
  useEffect(() => {
    if (!message) return;
    if (error) ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [error, message]);
  if (!message) return null;
  return <div ref={ref} tabIndex={-1} role={error ? "alert" : "status"} className="mt-4 scroll-m-4 outline-none">
    <SettingsNotice tone={error ? "danger" : "success"}>
      <div className="whitespace-pre-line break-words">{message}</div>
    </SettingsNotice>
  </div>;
}

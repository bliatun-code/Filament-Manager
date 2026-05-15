import { FeedbackBanner } from "../components/feedback_banner";

type SettingsFeedbackStackProps = {
  desktopOnlyMessage: string;
  error: string | null;
  info: string | null;
  tauri: boolean;
};

export function SettingsFeedbackStack({
  desktopOnlyMessage,
  error,
  info,
  tauri,
}: SettingsFeedbackStackProps) {
  return (
    <>
      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {desktopOnlyMessage}
        </FeedbackBanner>
      ) : null}

      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}
    </>
  );
}

import { FeedbackBanner } from "./feedback_banner";
import { PageHeaderButton } from "./page_header_button";

type PageLoadErrorBannerProps = {
  message: string;
  onRetry: () => void;
  retryDisabled?: boolean;
  retryLabel: string;
  retrying: boolean;
};

export function PageLoadErrorBanner({
  message,
  onRetry,
  retryDisabled = false,
  retryLabel,
  retrying,
}: PageLoadErrorBannerProps) {
  return (
    <FeedbackBanner tone="danger" className="mt-4">
      <div className="flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
        <span>{message}</span>
        <PageHeaderButton
          aria-busy={retrying}
          className="shrink-0"
          disabled={retryDisabled || retrying}
          onClick={onRetry}
          responsive={false}
          title={retryLabel}
          variant="soft"
        >
          {retryLabel}
        </PageHeaderButton>
      </div>
    </FeedbackBanner>
  );
}

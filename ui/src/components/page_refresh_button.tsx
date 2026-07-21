import { PageHeaderButton } from "./page_header_button";

type PageRefreshButtonProps = {
  disabled?: boolean;
  label: string;
  onRefresh: () => void;
  refreshing: boolean;
};

export function PageRefreshButton({
  disabled = false,
  label,
  onRefresh,
  refreshing,
}: PageRefreshButtonProps) {
  return (
    <PageHeaderButton
      aria-busy={refreshing}
      disabled={disabled || refreshing}
      onClick={onRefresh}
      responsive={false}
      title={label}
      variant="soft"
    >
      {label}
    </PageHeaderButton>
  );
}

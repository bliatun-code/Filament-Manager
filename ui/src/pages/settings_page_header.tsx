type SettingsPageHeaderProps = {
  subtitle: string;
  title: string;
};

export function SettingsPageHeader({ subtitle, title }: SettingsPageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1 className="page-title">{title}</h1>
        <div className="page-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

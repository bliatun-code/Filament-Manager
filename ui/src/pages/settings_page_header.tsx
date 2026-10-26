type SettingsPageHeaderProps = {
  subtitle: string;
  title: string;
};

export function SettingsPageHeader({ subtitle, title }: SettingsPageHeaderProps) {
  return (
    <header className="settings-balanced-header">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="sr-only">{subtitle}</p>
    </header>
  );
}

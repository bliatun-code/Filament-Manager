import { Suspense, lazy, startTransition, useEffect, useMemo, useState } from "react";
import { useI18n } from "./lib/i18n";
import { getThemeMode, onThemeModeChange } from "./lib/theme_mode";
import { isTauri, setDockIconTheme, setWindowTitle } from "./lib/tauri_client";
import brandIconDark from "./assets/logo_variants/logo-v3-10-dark-static.svg";
import brandIconLight from "./assets/logo_variants/logo-v3-10-light-static.svg";

const DashboardPage = lazy(() => import("./pages/dashboard"));
const InventoryPage = lazy(() => import("./pages/inventory"));
const LoansPage = lazy(() => import("./pages/loans"));
const PrintersPage = lazy(() => import("./pages/printers"));
const SettingsPage = lazy(() => import("./pages/settings"));
const StatisticsPage = lazy(() => import("./pages/statistics"));

export type PageKey =
  | "dashboard"
  | "inventory"
  | "loans"
  | "printers"
  | "statistics"
  | "settings";

export type InventoryNavigationIntent =
  | {
      kind: "LOW_STOCK";
      seq: number;
    }
  | null;

export type SettingsTabKey = "GENERAL" | "LIBRARY" | "PRINTERS" | "CATALOG" | "MAINTENANCE";

const pageOrder: ReadonlyArray<PageKey> = [
  "dashboard",
  "inventory",
  "loans",
  "printers",
  "statistics",
  "settings",
];

function initialPageFromUrl(): PageKey {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  return new URLSearchParams(window.location.search).get("bfm_inventory_fixture") === "detail"
    ? "inventory"
    : "dashboard";
}

export default function App() {
  const { t } = useI18n();
  const [activePage, setActivePage] = useState<PageKey>(() => initialPageFromUrl());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [inventoryNavigationIntent, setInventoryNavigationIntent] =
    useState<InventoryNavigationIntent>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabKey>("GENERAL");

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const syncDockIcon = async () => {
      const mode = getThemeMode();
      const resolvedMode =
        mode === "auto"
          ? document.documentElement.classList.contains("dark")
            ? "dark"
            : "light"
          : mode;
      setResolvedTheme(resolvedMode);
      try {
        await setDockIconTheme(resolvedMode);
      } catch (error) {
        console.error("Failed to sync dock icon theme", error);
      }
    };

    void syncDockIcon();
    return onThemeModeChange(() => {
      void syncDockIcon();
    });
  }, []);

  const pages = useMemo(
    () =>
      pageOrder.map((key) => ({
        key,
        label: t(`nav.${key}`),
      })),
    [t],
  );

  useEffect(() => {
    const currentPage = pages.find((page) => page.key === activePage);
    const title = currentPage?.label ?? t("app.title", "Filament Manager");
    void setWindowTitle(title);
  }, [activePage, pages, t]);

  const activePageLabel = pages.find((page) => page.key === activePage)?.label ?? t("app.title", "Filament Manager");

  const navigateToPage = (page: PageKey, nextInventoryIntent: InventoryNavigationIntent = null) => {
    startTransition(() => {
      setInventoryNavigationIntent(nextInventoryIntent);
      if (page !== "settings") {
        setSettingsInitialTab("GENERAL");
      }
      setActivePage(page);
    });
  };

  const content = (() => {
    switch (activePage) {
      case "dashboard":
        return (
          <DashboardPage
            onNavigate={(page) => navigateToPage(page)}
            onOpenCompanionSettings={() => {
              startTransition(() => {
                setInventoryNavigationIntent(null);
                setSettingsInitialTab("LIBRARY");
                setActivePage("settings");
              });
            }}
            onOpenLowStock={() => {
              navigateToPage("inventory", {
                kind: "LOW_STOCK",
                seq: Date.now(),
              });
            }}
          />
        );
      case "inventory":
        return (
          <InventoryPage
            navigationIntent={inventoryNavigationIntent}
            onConsumeNavigationIntent={() => setInventoryNavigationIntent(null)}
          />
        );
      case "loans":
        return <LoansPage />;
      case "printers":
        return <PrintersPage />;
      case "statistics":
        return <StatisticsPage />;
      case "settings":
        return <SettingsPage initialTab={settingsInitialTab} />;
      default:
        return (
          <InventoryPage
            navigationIntent={inventoryNavigationIntent}
            onConsumeNavigationIntent={() => setInventoryNavigationIntent(null)}
          />
        );
    }
  })();

  return (
    <div>
      <nav className="app-nav">
        <div className="app-nav-inner">
          <div className="app-nav-brand">
            <div className="app-nav-logo">
              <img
                src={resolvedTheme === "dark" ? brandIconDark : brandIconLight}
                alt="Filament Manager icon"
                className="h-8 w-8 rounded-lg"
              />
            </div>
            <span className="hidden text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:block">
              {t("app.title", "Filament Manager")}
            </span>
          </div>
          <div className="app-nav-list" aria-label={t("app.navigation", "Navigation")}>
            {pages.map((page) => (
              <button
                key={page.key}
                type="button"
                onClick={() => {
                  navigateToPage(page.key);
                }}
                className={`app-nav-button ${
                  activePage === page.key ? "app-nav-button-active" : "app-nav-button-idle"
                }`}
              >
                {page.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
      <Suspense
        fallback={
          <div className="surface-card mx-auto mt-4 flex min-h-[14rem] w-[calc(100%-2rem)] max-w-[1500px] items-center justify-center px-6 text-sm font-medium text-slate-500 dark:text-slate-300">
            {t("app.loadingPage", "Loading page...")} {activePageLabel}
          </div>
        }
      >
        {content}
      </Suspense>
    </div>
  );
}

import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_PAGE_LABEL_FALLBACKS,
  APP_PAGE_ORDER,
  resolveInitialPageFromSearch,
  type InventoryNavigationIntent,
  type PageKey,
} from "./lib/app_navigation_model";
import {
  desktopVisualQaInitialPage,
  desktopVisualQaInitialSettingsTab,
} from "./lib/desktop_visual_qa_scenario";
import { useI18n } from "./lib/i18n";
import { getThemeMode, onThemeModeChange } from "./lib/theme_mode";
import { isTauri, setDockIconTheme, setWindowTitle } from "./lib/tauri_client";
import type { SettingsTabKey } from "./pages/settings_page_model";
import brandIconDark from "./assets/logo_variants/logo-v3-10-dark-static.svg";
import brandIconLight from "./assets/logo_variants/logo-v3-10-light-static.svg";

const DashboardPage = lazy(() => import("./pages/dashboard"));
const InventoryPage = lazy(() => import("./pages/inventory"));
const LoansPage = lazy(() => import("./pages/loans"));
const PrintersPage = lazy(() => import("./pages/printers"));
const SettingsPage = lazy(() => import("./pages/settings"));
const StatisticsPage = lazy(() => import("./pages/statistics"));

function initialPageFromUrl(): PageKey {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  return resolveInitialPageFromSearch(window.location.search);
}

function initialSettingsTabFromUrl(): SettingsTabKey {
  if (typeof window === "undefined") {
    return "GENERAL";
  }
  return desktopVisualQaInitialSettingsTab(window.location.search) ?? "GENERAL";
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
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTabKey>(() => initialSettingsTabFromUrl());
  const activeNavButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.DEV) {
      return;
    }

    let attempts = 0;
    let intervalId: number | null = null;
    const syncVisualQaRoute = () => {
      attempts += 1;
      const page = desktopVisualQaInitialPage(window.location.search);
      if (page) {
        setInventoryNavigationIntent(null);
        setSettingsInitialTab(desktopVisualQaInitialSettingsTab(window.location.search) ?? "GENERAL");
        setActivePage(page);
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }
      if (attempts >= 75 && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    intervalId = window.setInterval(syncVisualQaRoute, 200);
    syncVisualQaRoute();
    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

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
      APP_PAGE_ORDER.map((key) => ({
        key,
        label: t(`nav.${key}`, APP_PAGE_LABEL_FALLBACKS[key]),
      })),
    [t],
  );

  useEffect(() => {
    const currentPage = pages.find((page) => page.key === activePage);
    const title = currentPage?.label ?? t("app.title", "Filament Manager");
    void setWindowTitle(title);
  }, [activePage, pages, t]);

  useEffect(() => {
    activeNavButtonRef.current?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
  }, [activePage]);

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
            onAddFirstSpool={() => {
              navigateToPage("inventory", {
                kind: "ADD_SPOOL",
                seq: Date.now(),
              });
            }}
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
      <a className="app-skip-link" href="#app-main-content">
        {t("app.skipToMainContent", "Skip to main content")}
      </a>
      <nav className="app-nav" aria-label={t("app.navigation", "Navigation")}>
        <div className="app-nav-inner">
          <div className="app-nav-brand">
            <div className="app-nav-logo">
              <img
                src={resolvedTheme === "dark" ? brandIconDark : brandIconLight}
                alt={t("app.iconAlt", "Filament Manager icon")}
                className="h-8 w-8 rounded-lg"
              />
            </div>
            <span className="hidden text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 min-[900px]:block">
              {t("app.title", "Filament Manager")}
            </span>
          </div>
          <div className="app-nav-list">
            {pages.map((page) => (
              <button
                key={page.key}
                ref={activePage === page.key ? activeNavButtonRef : undefined}
                type="button"
                aria-current={activePage === page.key ? "page" : undefined}
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
      <main id="app-main-content" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="surface-card mx-auto mt-4 flex min-h-[14rem] w-[calc(100%-2rem)] max-w-[1500px] items-center justify-center px-6 text-sm font-medium text-slate-500 dark:text-slate-300">
              {t("app.loadingPage", "Loading page...")} {activePageLabel}
            </div>
          }
        >
          {content}
        </Suspense>
      </main>
    </div>
  );
}

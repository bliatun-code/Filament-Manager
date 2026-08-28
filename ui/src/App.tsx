import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { trustedReleaseUrl } from "./lib/app_update_check";
import { useAppUpdateContext } from "./lib/app_update_context";
import { useI18n } from "./lib/i18n";
import { getResolvedTheme, getThemeMode, onThemeModeChange } from "./lib/theme_mode";
import {
  isTauri,
  openExternalUrl,
  setDesktopTrayMenuLabels,
  setDockIconTheme,
  setWindowTitle,
} from "./lib/tauri_client";
import {
  prepareDesktopVisualQaWindow,
  signalDesktopVisualQaTheme,
} from "./lib/tauri_visual_qa_client";
import type { SettingsTabKey } from "./pages/settings_page_model";
import { AppUpdateBanner } from "./components/app_update_banner";
import type { SettingsFilamentDefaultsFocusTarget } from "./components/settings_filament_defaults_tab";
import type { FilamentPriceBatchReceipt } from "./lib/settings_filament_defaults_model";
import type { InventoryNavigationGuard } from "./lib/use_inventory_unsaved_changes_guard";
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

function initialSettingsTabFromUrl(): SettingsTabKey | null {
  if (typeof window === "undefined") {
    return null;
  }
  return desktopVisualQaInitialSettingsTab(window.location.search);
}

export default function App() {
  const { locale, t } = useI18n();
  const appUpdate = useAppUpdateContext();
  const [activePage, setActivePage] = useState<PageKey>(() => initialPageFromUrl());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [inventoryNavigationIntent, setInventoryNavigationIntent] =
    useState<InventoryNavigationIntent>(null);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTabKey | null>(() => initialSettingsTabFromUrl());
  const [settingsInitialPrinterId, setSettingsInitialPrinterId] = useState<string | null>(null);
  const [settingsFilamentDefaultsFocusTarget, setSettingsFilamentDefaultsFocusTarget] =
    useState<SettingsFilamentDefaultsFocusTarget>(null);
  const [filamentPriceBatchReceipt, setFilamentPriceBatchReceipt] =
    useState<FilamentPriceBatchReceipt | null>(null);
  const activeNavButtonRef = useRef<HTMLButtonElement | null>(null);
  const inventoryNavigationGuardRef = useRef<InventoryNavigationGuard | null>(null);
  const handleInventoryNavigationGuardChange = useCallback(
    (guard: InventoryNavigationGuard | null) => {
      inventoryNavigationGuardRef.current = guard;
    },
    [],
  );

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
        setSettingsInitialTab(desktopVisualQaInitialSettingsTab(window.location.search));
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
    if (
      typeof window === "undefined" ||
      !import.meta.env.DEV ||
      !isTauri() ||
      !desktopVisualQaInitialPage(window.location.search)
    ) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      void prepareDesktopVisualQaWindow().catch((error) => {
        console.error("Failed to prepare desktop visual QA window.", error);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const syncDockIcon = async () => {
      const themeMode = getThemeMode();
      const resolvedMode = getResolvedTheme(themeMode);
      setResolvedTheme(resolvedMode);
      try {
        await setDockIconTheme(resolvedMode);
      } catch (error) {
        console.error("Failed to sync dock icon theme", error);
      }
      if (
        import.meta.env.DEV &&
        typeof window !== "undefined" &&
        desktopVisualQaInitialPage(window.location.search) &&
        (themeMode === "bambu" || themeMode === "prusa")
      ) {
        const accent = getComputedStyle(document.documentElement)
          .getPropertyValue("--app-theme-accent")
          .trim();
        try {
          await signalDesktopVisualQaTheme(themeMode, "dark", accent);
        } catch (error) {
          console.error("Failed to report desktop visual QA theme", error);
        }
      }
    };

    void syncDockIcon();
    return onThemeModeChange(() => {
      void syncDockIcon();
    });
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    void setDesktopTrayMenuLabels(
      t("settings.backgroundTrayOpen", "Open Filament Manager"),
      t("settings.backgroundTrayQuit", "Quit Filament Manager"),
    ).catch((error) => {
      console.error("Failed to localize the desktop tray menu.", error);
    });
  }, [locale, t]);

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
  const availableUpdate =
    appUpdate.showUpdateNotification && appUpdate.state.status === "SUCCESS"
      ? appUpdate.state.result
      : null;

  const navigateToPage = (page: PageKey, nextInventoryIntent: InventoryNavigationIntent = null) => {
    const completeNavigation = () => {
      startTransition(() => {
        setInventoryNavigationIntent(nextInventoryIntent);
        if (page !== "settings") {
          setSettingsInitialTab(null);
          setSettingsInitialPrinterId(null);
          setSettingsFilamentDefaultsFocusTarget(null);
        }
        setActivePage(page);
      });
    };
    if (
      page !== activePage &&
      inventoryNavigationGuardRef.current &&
      !inventoryNavigationGuardRef.current(completeNavigation)
    ) {
      return;
    }
    completeNavigation();
  };

  const openSettingsTab = (
    tab: SettingsTabKey,
    filamentDefaultsFocusTarget: SettingsFilamentDefaultsFocusTarget = null,
  ) => {
    startTransition(() => {
      setInventoryNavigationIntent(null);
      setSettingsInitialTab(tab);
      setSettingsInitialPrinterId(null);
      setSettingsFilamentDefaultsFocusTarget(
        tab === "FILAMENT_DEFAULTS" ? filamentDefaultsFocusTarget : null,
      );
      setActivePage("settings");
    });
  };

  const openBambuLiveSettings = (printerId: string) => {
    startTransition(() => {
      setInventoryNavigationIntent(null);
      setSettingsInitialTab("PRINTERS");
      setSettingsInitialPrinterId(printerId);
      setSettingsFilamentDefaultsFocusTarget(null);
      setActivePage("settings");
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
              openSettingsTab("LIBRARY");
            }}
            onOpenMaintenanceSettings={() => openSettingsTab("MAINTENANCE")}
            onOpenBambuLiveSettings={openBambuLiveSettings}
            onOpenPrinters={() => navigateToPage("printers")}
            onOpenLowStock={() => {
              navigateToPage("inventory", {
                kind: "LOW_STOCK",
                seq: Date.now(),
              });
            }}
            onOpenPurchases={(status, notice) => {
              navigateToPage("inventory", {
                kind: "PURCHASES",
                notice,
                seq: Date.now(),
                status,
              });
            }}
          />
        );
      case "inventory":
        return (
          <InventoryPage
            navigationIntent={inventoryNavigationIntent}
            onConsumeNavigationIntent={() => setInventoryNavigationIntent(null)}
            onNavigationGuardChange={handleInventoryNavigationGuardChange}
          />
        );
      case "loans":
        return <LoansPage />;
      case "printers":
        return <PrintersPage />;
      case "statistics":
        return (
          <StatisticsPage
            onOpenFilamentDefaults={(target) =>
              openSettingsTab("FILAMENT_DEFAULTS", target)
            }
          />
        );
      case "settings":
        return (
          <SettingsPage
            filamentPriceBatchReceipt={filamentPriceBatchReceipt}
            initialFilamentDefaultsFocusTarget={settingsFilamentDefaultsFocusTarget}
            initialPrinterId={settingsInitialPrinterId}
            initialTab={settingsInitialTab}
            onFilamentPriceBatchReceiptChange={setFilamentPriceBatchReceipt}
            onOpenInventorySpoolDetails={(spoolId) => {
              navigateToPage("inventory", {
                kind: "SPOOL_DETAIL",
                seq: Date.now(),
                spoolId,
              });
            }}
          />
        );
      default:
        return (
          <InventoryPage
            navigationIntent={inventoryNavigationIntent}
            onConsumeNavigationIntent={() => setInventoryNavigationIntent(null)}
            onNavigationGuardChange={handleInventoryNavigationGuardChange}
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
      {availableUpdate ? (
        <AppUpdateBanner
          result={availableUpdate}
          t={t}
          onDismiss={appUpdate.dismissAvailableUpdate}
          onViewRelease={() => {
            void openExternalUrl(trustedReleaseUrl(availableUpdate));
          }}
        />
      ) : null}
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

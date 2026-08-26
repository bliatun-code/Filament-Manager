use crate::backend::statistics::{
    FilamentConsumptionRow, InventoryOverview, MaterialUsageRow, StatisticsEngine,
    StatisticsPeriod, StatisticsPeriodReport,
};
use crate::state::AppState;
use crate::with_stats;

#[tauri::command]
pub(crate) fn inventory_overview(
    state: tauri::State<'_, AppState>,
) -> Result<InventoryOverview, String> {
    with_stats(&state, |stats| stats.inventory_overview())
}

#[tauri::command]
pub(crate) fn top_materials(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<MaterialUsageRow>, String> {
    with_stats(&state, |stats| stats.top_materials(limit))
}

#[tauri::command]
pub(crate) fn list_filament_consumption(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    printer_id: Option<String>,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_stats(&state, |stats| {
        stats.filament_consumption(capped, printer_id.as_deref())
    })
}

#[tauri::command]
pub(crate) fn statistics_period_report(
    state: tauri::State<'_, AppState>,
    period: StatisticsPeriod,
) -> Result<StatisticsPeriodReport, String> {
    let stats = StatisticsEngine::open(&state.db_path)
        .map_err(|error| format!("Open statistics database: {error}"))?;
    stats
        .period_report(&period)
        .map_err(|error| format!("Statistics period query: {error}"))
}

import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactElement, type KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatisticsAnalysisNavigation, StatisticsAnalysisPanel } from "./statistics_analysis_navigation";
import type { StatisticsAnalysisView } from "./statistics_analysis_model";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const t = (_key: string, fallback = "") => fallback;

test("analysis views expose one tab stop and matched tab/panel relationships", () => {
  const html = renderToStaticMarkup(<>
    <StatisticsAnalysisNavigation view="VALUE" onViewChange={() => {}} t={t} />
    <StatisticsAnalysisPanel view="CONSUMPTION" activeView="VALUE">Consumption detail state</StatisticsAnalysisPanel>
    <StatisticsAnalysisPanel view="VALUE" activeView="VALUE">Currency detail state</StatisticsAnalysisPanel>
    <StatisticsAnalysisPanel view="PRINTERS" activeView="VALUE">Printer detail state</StatisticsAnalysisPanel>
  </>);
  assert.match(html, /role="tablist" aria-label="Statistics views" aria-orientation="horizontal"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /id="statistics-view-value" aria-controls="statistics-panel-value" aria-selected="true" tabindex="0"/);
  assert.equal((html.match(/aria-selected="false" tabindex="-1"/g) ?? []).length, 2);
  assert.match(html, /id="statistics-panel-value" aria-labelledby="statistics-view-value" tabindex="0" class=/);
  assert.match(html, /id="statistics-panel-printers"[^>]*hidden=""/);
  assert.match(html, /id="statistics-panel-consumption"[^>]*hidden=""/);
  assert.match(html, /Consumption detail state/);
  assert.match(html, /Currency detail state/);
  assert.match(html, /Printer detail state/);
});

test("keyboard tab activation changes the selected view and focuses its tab", () => {
  const changed: StatisticsAnalysisView[] = [];
  const focused: string[] = [];
  let prevented = 0;
  const nav = StatisticsAnalysisNavigation({ view: "CONSUMPTION", onViewChange: (view) => changed.push(view), t });
  const buttons = nav.props.children as ReactElement<{
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  }>[];
  const event = (key: string) => ({
    key,
    preventDefault: () => { prevented += 1; },
    currentTarget: { ownerDocument: { getElementById: (id: string) => ({ focus: () => focused.push(id) }) } },
  }) as unknown as KeyboardEvent<HTMLButtonElement>;
  buttons[0].props.onKeyDown(event("ArrowLeft"));
  buttons[1].props.onKeyDown(event("Home"));
  buttons[0].props.onKeyDown(event("End"));
  buttons[0].props.onKeyDown(event("Tab"));
  buttons[1].props.onClick();
  assert.deepEqual(changed, ["PRINTERS", "CONSUMPTION", "PRINTERS", "VALUE"]);
  assert.deepEqual(focused, ["statistics-view-printers", "statistics-view-consumption", "statistics-view-printers"]);
  assert.equal(prevented, 3);
});

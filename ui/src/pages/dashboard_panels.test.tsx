import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OwnershipSnapshotPanel } from "./dashboard_panels";
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const t = (_key: string, fallback: string) => fallback;

test("ownership footer preserves borrowed-in inventory without scores or repeating the headline total", () => {
  const render = (borrowedIn: number) => renderToStaticMarkup(<OwnershipSnapshotPanel onHand={{ owned: 48, borrowedIn }} loadedSlots={4} onOrder="0" t={t} />);
  assert.match(render(0), /No borrowed-in stock/);
  assert.doesNotMatch(render(0), />48|Inventory Health|%/);
  assert.match(render(2), /Owned on hand.*48.*Borrowed in on hand.*2/);
  assert.match(render(0), /4.*slots loaded.*0.*on order/);
});

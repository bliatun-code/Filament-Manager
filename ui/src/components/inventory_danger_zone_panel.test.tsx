import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  InventoryDangerZonePanelView,
  type InventoryDangerZonePanelViewProps,
} from "./inventory_danger_zone_panel";
import { requestInventoryDetailDiscard } from "../lib/use_inventory_unsaved_changes_guard";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const source = readFileSync(
  new URL("./inventory_danger_zone_panel.tsx", import.meta.url),
  "utf8",
);
const fallbackT: InventoryDangerZonePanelViewProps["t"] = (_key, fallback = "") => fallback;

function viewProps(
  overrides: Partial<InventoryDangerZonePanelViewProps> = {},
): InventoryDangerZonePanelViewProps {
  return {
    confirmDelete: false,
    confirmMarkEmpty: false,
    confirmPurge: false,
    disabled: false,
    onCancel: () => {},
    onDelete: () => {},
    onMarkEmpty: () => {},
    onPurge: () => {},
    onRefill: () => {},
    onRequestMarkEmpty: () => {},
    rollLabel: "Bambu Lab · PLA Matte · Matte Ash Gray (#812496)",
    status: "IN_STOCK",
    t: fallbackT,
    ...overrides,
  };
}

function renderView(overrides: Partial<InventoryDangerZonePanelViewProps> = {}) {
  return renderToStaticMarkup(<InventoryDangerZonePanelView {...viewProps(overrides)} />);
}

type TestElement = ReactElement<Record<string, unknown>>;

function expandedChildren(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) {
    return node.flatMap(expandedChildren);
  }
  if (!isValidElement(node)) {
    return [];
  }

  const element = node as TestElement;
  if (typeof element.type === "function") {
    const Component = element.type as (props: Record<string, unknown>) => ReactNode;
    return [Component(element.props)];
  }

  return [element.props.children as ReactNode];
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  return expandedChildren(node).map(textContent).join("");
}

function findElements(node: ReactNode, tagName: string): TestElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElements(child, tagName));
  }
  if (!isValidElement(node)) {
    return [];
  }

  const element = node as TestElement;
  if (typeof element.type === "function") {
    const Component = element.type as (props: Record<string, unknown>) => ReactNode;
    return findElements(Component(element.props), tagName);
  }

  return [
    ...(element.type === tagName ? [element] : []),
    ...findElements(element.props.children as ReactNode, tagName),
  ];
}

function findButton(node: ReactNode, label: string): TestElement {
  const button = findElements(node, "button").find(
    (element) => textContent(element.props.children as ReactNode).trim() === label,
  );
  assert.ok(button, `Expected button labelled "${label}"`);
  return button;
}

function click(element: TestElement) {
  const onClick = element.props.onClick;
  assert.equal(typeof onClick, "function");
  (onClick as () => void)();
}

test("danger zone is a closed native disclosure with accessible relationships", () => {
  const html = renderView();

  assert.match(html, /^<details id="inventory-danger-zone-panel"/);
  assert.doesNotMatch(html, /^<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(html, /aria-describedby="inventory-danger-zone-hint"/);
  assert.match(html, /<summary[^>]*aria-controls="inventory-danger-zone-actions"/);
  assert.match(html, /id="inventory-danger-zone-hint"/);
  assert.match(html, /id="inventory-danger-zone-actions"/);
  assert.match(html, /Open only when you need to empty, remove or permanently purge this roll/);
});

test("first mark-empty interaction only requests confirmation", () => {
  let requestCount = 0;
  let writeCount = 0;
  const tree = InventoryDangerZonePanelView(
    viewProps({
      onMarkEmpty: () => {
        writeCount += 1;
      },
      onRequestMarkEmpty: () => {
        requestCount += 1;
      },
    }),
  );

  const html = renderView();
  assert.match(html, /id="inventory-mark-empty-request"/);

  click(findButton(tree, "Mark as used up (empty)"));

  assert.equal(requestCount, 1);
  assert.equal(writeCount, 0);
});

test("mark-empty confirmation explains 0 g and slot removal, and supports confirm and cancel", () => {
  let cancelCount = 0;
  let writeCount = 0;
  const props = viewProps({
    confirmMarkEmpty: true,
    onCancel: () => {
      cancelCount += 1;
    },
    onMarkEmpty: () => {
      writeCount += 1;
    },
  });
  const html = renderToStaticMarkup(<InventoryDangerZonePanelView {...props} />);
  const tree = InventoryDangerZonePanelView(props);

  assert.match(html, /id="inventory-mark-empty-confirmation"[^>]*role="alert"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Remaining weight will be set to 0 g/);
  assert.match(html, /removed from that slot/);
  assert.match(html, /Bambu Lab · PLA Matte · Matte Ash Gray \(#812496\)/);

  click(findButton(tree, "Mark roll as empty"));
  click(findButton(tree, "Cancel"));
  assert.equal(writeCount, 1);
  assert.equal(cancelCount, 1);

  assert.match(
    source,
    /const confirmMarkEmptyAction = \(\) => \{\s*setConfirmMarkEmpty\(false\);\s*onMarkEmpty\(\);/,
  );
  assert.match(source, /onMarkEmpty=\{confirmMarkEmptyAction\}/);
});

test("EMPTY rolls hide mark-empty while retaining the refill action", () => {
  const html = renderView({ status: "EMPTY" });

  assert.match(html, />Refill \/ Reactivate roll<\/button>/);
  assert.doesNotMatch(html, /Mark as used up \(empty\)/);
  assert.doesNotMatch(html, /Mark this roll as empty\?/);
});

test("delete and permanent purge render contextual inline confirmations with separate cancel", () => {
  const deleteHtml = renderView({ confirmDelete: true });
  assert.match(deleteHtml, /role="alert"/);
  assert.match(deleteHtml, /Delete this roll from active inventory\?/);
  assert.match(deleteHtml, /recorded history is retained/);
  assert.match(deleteHtml, />Delete from active inventory<\/button>/);
  assert.match(deleteHtml, />Cancel<\/button>/);
  assert.match(deleteHtml, /Bambu Lab · PLA Matte · Matte Ash Gray \(#812496\)/);

  const purgeHtml = renderView({ confirmPurge: true });
  assert.match(purgeHtml, /Permanently purge this roll and all history\?/);
  assert.match(purgeHtml, /This cannot be undone/);
  assert.match(purgeHtml, />Purge roll permanently<\/button>/);
  assert.match(purgeHtml, />Cancel<\/button>/);
  assert.match(purgeHtml, /border-red-500 bg-red-50/);
  assert.match(purgeHtml, /bg-red-600/);
});

test("closing the disclosure cancels local and parent confirmations", () => {
  let cancelCount = 0;
  const tree = InventoryDangerZonePanelView(
    viewProps({
      confirmDelete: true,
      onCancel: () => {
        cancelCount += 1;
      },
    }),
  );
  assert.ok(isValidElement(tree));
  const details = tree as TestElement;
  const onToggle = details.props.onToggle;
  assert.equal(typeof onToggle, "function");

  (onToggle as (event: { currentTarget: { open: boolean } }) => void)({
    currentTarget: { open: true },
  });
  assert.equal(cancelCount, 0);

  (onToggle as (event: { currentTarget: { open: boolean } }) => void)({
    currentTarget: { open: false },
  });
  assert.equal(cancelCount, 1);
});

test("unsaved detail guard preserves danger state until discard is accepted", () => {
  let discardCount = 0;
  let promptCount = 0;

  const blocked = requestInventoryDetailDiscard({
    confirmDiscard: () => {
      promptCount += 1;
      return false;
    },
    hasUnsavedChanges: true,
    message: "Discard unsaved roll changes?",
    onDiscard: () => {
      discardCount += 1;
    },
  });
  assert.equal(blocked, false);
  assert.equal(promptCount, 1);
  assert.equal(discardCount, 0);

  const accepted = requestInventoryDetailDiscard({
    confirmDiscard: () => {
      promptCount += 1;
      return true;
    },
    hasUnsavedChanges: true,
    message: "Discard unsaved roll changes?",
    onDiscard: () => {
      discardCount += 1;
    },
  });
  assert.equal(accepted, true);
  assert.equal(promptCount, 2);
  assert.equal(discardCount, 1);
});

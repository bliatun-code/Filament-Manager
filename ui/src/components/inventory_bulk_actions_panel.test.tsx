import assert from "node:assert/strict";
import test from "node:test";
import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildInventoryBulkDataPlan,
  buildInventoryBulkMutationPlan,
  type InventoryBulkDataPlan,
  type InventoryBulkMutationPlan,
  type InventoryBulkSpoolSnapshot,
} from "../lib/inventory_bulk_actions_model";
import {
  InventoryBulkActionsPanelView,
  InventoryBulkSelectVisibleCheckbox,
  type InventoryBulkActionsCopy,
  type InventoryBulkActionsPanelViewProps,
} from "./inventory_bulk_actions_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const copy: InventoryBulkActionsCopy = {
  archivedLocation: (name) => `${name} (archived)`,
  atomicWarning: (count) =>
    `All ${count} changes are committed together with history, or none are written.`,
  cancel: "Cancel",
  clearSelection: "Clear selection",
  chooseLocation: "Choose a location",
  confirm: (action, count) => `Confirm ${action} for ${count}`,
  createLabels: (count) => `Labels (${count})`,
  exportSelectedCsv: (count) => `Export CSV (${count})`,
  exportSelectedJson: (count) => `Export JSON (${count})`,
  locationLabel: "Destination",
  moveTitle: "Move selected",
  noSelection: "No spools selected",
  reviewAffected: (count) => `${count} affected`,
  reviewAffectedTerm: "Affected",
  reviewChanged: "The selection or spool data changed. Review again.",
  reviewMove: "Review move",
  reviewSelection: (count) => `${count} selected`,
  reviewSelectionTerm: "Selection",
  reviewStatus: "Review status",
  reviewTarget: (action, target) => `${action} target: ${target}`,
  reviewTargetTerm: "Target",
  reviewTitle: (action) => `Confirm ${action}`,
  reviewUnchanged: (count) => `${count} unchanged`,
  reviewUnchangedTerm: "Unchanged",
  selectVisible: (count) => `Select ${count} visible spools`,
  selected: (count) => `${count} spools selected`,
  statusLabel: "New status",
  statusName: (status) => status,
  statusTitle: "Change status",
  title: "Bulk actions",
};

function snapshot(
  spoolId: string,
  overrides: Partial<InventoryBulkSpoolSnapshot> = {},
): InventoryBulkSpoolSnapshot {
  return {
    activeLoan: false,
    assignedToPrinter: false,
    homeLocationId: "location-a",
    locationId: "location-a",
    spoolId,
    status: "IN_STOCK",
    ...overrides,
  };
}

const snapshots = [
  snapshot("spool-a"),
  snapshot("spool-b", {
    homeLocationId: "location-b",
    locationId: "location-b",
    status: "EMPTY",
  }),
  snapshot("spool-c", { status: "LOST" }),
];

function unwrapMutationPlan(
  result: ReturnType<typeof buildInventoryBulkMutationPlan>,
): InventoryBulkMutationPlan {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.issues));
  }
  return result.plan;
}

function unwrapDataPlan(
  result: ReturnType<typeof buildInventoryBulkDataPlan>,
): InventoryBulkDataPlan {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.issues));
  }
  return result.plan;
}

const labelsPlan = unwrapDataPlan(
  buildInventoryBulkDataPlan({
    action: "LABELS",
    selectedSpoolIds: snapshots.map((row) => row.spoolId),
    snapshots,
  }),
);
const exportPlan = unwrapDataPlan(
  buildInventoryBulkDataPlan({
    action: "EXPORT",
    selectedSpoolIds: snapshots.map((row) => row.spoolId),
    snapshots,
  }),
);
const moveReview = unwrapMutationPlan(
  buildInventoryBulkMutationPlan({
    action: "MOVE",
    selectedSpoolIds: snapshots.map((row) => row.spoolId),
    snapshots,
    targetLocation: { archived: false, id: "location-b", name: "Shelf B" },
  }),
);

function panelProps(
  overrides: Partial<InventoryBulkActionsPanelViewProps> = {},
): InventoryBulkActionsPanelViewProps {
  return {
    copy,
    disabled: false,
    exportPlan,
    labelsPlan,
    locationTargets: [
      { archived: false, id: "location-a", name: "Shelf A" },
      { archived: false, id: "location-b", name: "Shelf B" },
      { archived: true, id: "location-old", name: "Old shelf" },
    ],
    moveTargetLocationId: "location-b",
    onCancelReview: () => {},
    onConfirmReview: () => {},
    onCreateLabels: () => {},
    onClearSelection: () => {},
    onExportCsv: () => {},
    onExportJson: () => {},
    onMoveTargetLocationIdChange: () => {},
    onRequestMoveReview: () => {},
    onRequestStatusReview: () => {},
    onSelectVisibleChange: () => {},
    onStatusTargetChange: () => {},
    review: null,
    reviewCurrent: true,
    selectedCount: 3,
    statusTarget: "EMPTY",
    visibleCount: 3,
    visibleSelectionState: "ALL",
    ...overrides,
  };
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
    (candidate) => textContent(candidate.props.children as ReactNode).trim() === label,
  );
  assert.ok(button, `missing button labelled ${label}`);
  return button;
}

function click(element: TestElement): void {
  const onClick = element.props.onClick;
  assert.equal(typeof onClick, "function");
  (onClick as () => void)();
}

test("configuration shows exact selection and separate MOVE, STATUS, LABELS, and EXPORT actions", () => {
  const html = renderToStaticMarkup(<InventoryBulkActionsPanelView {...panelProps()} />);

  assert.match(html, /aria-labelledby="inventory-bulk-actions-title"/);
  assert.match(html, /3 spools selected/);
  assert.match(html, />Move selected</);
  assert.match(html, />Change status</);
  assert.match(html, />Review move<\/button>/);
  assert.match(html, />Review status<\/button>/);
  assert.match(html, />Labels \(3\)<\/button>/);
  assert.match(html, />Export CSV \(3\)<\/button>/);
  assert.match(html, />Export JSON \(3\)<\/button>/);
  assert.match(html, /Select 3 visible spools/);
  assert.match(html, />Clear selection<\/button>/);
  assert.match(html, /<option value="location-old" disabled="">Old shelf \(archived\)<\/option>/);
  assert.doesNotMatch(html, /Confirm MOVE/);
});

test("first mutation step requests a review and never calls the backend confirmation callback", () => {
  let moveTarget = "";
  let statusTarget = "";
  let confirmCount = 0;
  const tree = InventoryBulkActionsPanelView(
    panelProps({
      onConfirmReview: () => {
        confirmCount += 1;
      },
      onRequestMoveReview: (target) => {
        moveTarget = target.id;
      },
      onRequestStatusReview: (status) => {
        statusTarget = status;
      },
    }),
  );

  click(findButton(tree, "Review move"));
  click(findButton(tree, "Review status"));
  assert.equal(moveTarget, "location-b");
  assert.equal(statusTarget, "EMPTY");
  assert.equal(confirmCount, 0);
});

test("LABELS and EXPORT callbacks receive the exact validated selection plans", () => {
  let receivedLabels: InventoryBulkDataPlan | null = null;
  let receivedCsv: InventoryBulkDataPlan | null = null;
  let receivedJson: InventoryBulkDataPlan | null = null;
  const tree = InventoryBulkActionsPanelView(
    panelProps({
      onCreateLabels: (plan) => {
        receivedLabels = plan;
      },
      onExportCsv: (plan) => {
        receivedCsv = plan;
      },
      onExportJson: (plan) => {
        receivedJson = plan;
      },
    }),
  );

  click(findButton(tree, "Labels (3)"));
  click(findButton(tree, "Export CSV (3)"));
  click(findButton(tree, "Export JSON (3)"));
  assert.deepEqual(receivedLabels, labelsPlan);
  assert.deepEqual(receivedCsv, exportPlan);
  assert.deepEqual(receivedJson, exportPlan);
  assert.deepEqual(receivedLabels?.spoolIds, ["spool-a", "spool-b", "spool-c"]);
});

test("second mutation step shows exact affected count and is the only step that can confirm", () => {
  let confirmed: InventoryBulkMutationPlan | null = null;
  let cancelled = 0;
  const props = panelProps({
    onCancelReview: () => {
      cancelled += 1;
    },
    onConfirmReview: (plan) => {
      confirmed = plan;
    },
    review: moveReview,
  });
  const html = renderToStaticMarkup(<InventoryBulkActionsPanelView {...props} />);
  const tree = InventoryBulkActionsPanelView(props);

  assert.match(html, /role="alert"/);
  assert.match(html, /3 selected/);
  assert.match(html, /2 affected/);
  assert.match(html, /1 unchanged/);
  assert.match(html, /MOVE target: Shelf B/);
  assert.match(html, /All 2 changes are committed together with history, or none are written/);
  assert.doesNotMatch(html, />Review move<\/button>/);

  click(findButton(tree, "Confirm MOVE for 2"));
  click(findButton(tree, "Cancel"));
  assert.deepEqual(confirmed, moveReview);
  assert.equal(cancelled, 1);
});

test("a changed review is visible and cannot be confirmed", () => {
  const html = renderToStaticMarkup(
    <InventoryBulkActionsPanelView
      {...panelProps({ review: moveReview, reviewCurrent: false })}
    />,
  );
  assert.match(html, /The selection or spool data changed\. Review again\./);
  assert.match(html, /<button(?=[^>]*disabled="")[^>]*>Confirm MOVE for 2<\/button>/);
});

test("no selection or mismatched data plans disables every action", () => {
  const html = renderToStaticMarkup(
    <InventoryBulkActionsPanelView
      {...panelProps({
        exportPlan: null,
        labelsPlan: null,
        moveTargetLocationId: "location-old",
        selectedCount: 0,
      })}
    />,
  );
  assert.match(html, /No spools selected/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 7);
});

test("select-visible checkbox exposes controlled, accessible multi-selection", () => {
  let selectVisibleChecked = true;
  const selectAllTree = InventoryBulkSelectVisibleCheckbox({
    disabled: false,
    label: "Select visible spools",
    onCheckedChange: (checked) => {
      selectVisibleChecked = checked;
    },
    state: "SOME",
  });
  const selectAllHtml = renderToStaticMarkup(selectAllTree);
  assert.match(selectAllHtml, /aria-checked="mixed"/);
  assert.match(selectAllHtml, /Select visible spools/);
  const selectAllInput = findElements(selectAllTree, "input")[0];
  assert.ok(selectAllInput);
  const selectAllOnChange = selectAllInput.props.onChange;
  assert.equal(typeof selectAllOnChange, "function");
  (selectAllOnChange as (event: { currentTarget: { checked: boolean } }) => void)({
    currentTarget: { checked: false },
  });
  assert.equal(selectVisibleChecked, false);
});

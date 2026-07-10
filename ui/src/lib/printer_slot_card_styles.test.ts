import test from "node:test";
import assert from "node:assert/strict";
import { buildPrinterSlotCardStyles } from "./printer_slot_card_styles";

test("printer slot card styles stay empty when no swatch or assigned roll exists", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: null,
    hasAssignedSpool: false,
    isDropdownOpen: false,
    resolvedTheme: "dark",
  });

  assert.equal(styles.selectorStyle, undefined);
  assert.equal(styles.currentRollStyle, undefined);
  assert.equal(styles.actionStyle, undefined);
  assert.equal(styles.panelStyle, undefined);
});

test("printer slot card styles tint selectable controls from the active swatch", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: "#22c55e",
    hasAssignedSpool: true,
    isDropdownOpen: true,
    resolvedTheme: "light",
  });

  assert.equal(styles.selectorStyle?.borderColor, "rgba(2, 132, 199, 0.94)");
  assert.equal(styles.currentRollStyle?.borderColor, "rgba(100, 116, 139, 0.42)");
  assert.equal(styles.selectorStyle?.borderWidth, 1);
  assert.equal(styles.currentRollStyle?.borderWidth, 1);
  assert.match(String(styles.selectorStyle?.boxShadow), /rgba\(14, 165, 233, 0\.24\)/);
  assert.equal(styles.actionStyle, undefined);
  assert.match(String(styles.panelStyle?.backgroundImage), /linear-gradient/);
});

test("printer slot card styles reserve blue emphasis for the open selector", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: "#22c55e",
    hasAssignedSpool: true,
    isDropdownOpen: false,
    resolvedTheme: "light",
  });

  assert.equal(styles.selectorStyle?.borderColor, "rgba(71, 85, 105, 0.68)");
  assert.equal(styles.currentRollStyle?.borderColor, "rgba(100, 116, 139, 0.42)");
});

test("printer slot card styles only show current roll emphasis for assigned slots", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: "#000000",
    hasAssignedSpool: false,
    isDropdownOpen: false,
    resolvedTheme: "dark",
  });

  assert.ok(styles.selectorStyle);
  assert.equal(styles.currentRollStyle, undefined);
  assert.equal(styles.actionStyle, undefined);
  assert.ok(styles.panelStyle);
});

test("printer slot card styles preserve transparent dark selector chrome", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: "#22c55e",
    hasAssignedSpool: true,
    isDropdownOpen: true,
    resolvedTheme: "dark",
  });

  assert.equal(styles.selectorStyle?.borderColor, "transparent");
  assert.equal(styles.currentRollStyle?.borderColor, "transparent");
  assert.equal(
    styles.selectorStyle?.boxShadow,
    "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  );
  assert.equal(
    styles.currentRollStyle?.boxShadow,
    "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  );
});

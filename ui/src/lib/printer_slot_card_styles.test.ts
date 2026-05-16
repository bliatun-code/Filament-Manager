import test from "node:test";
import assert from "node:assert/strict";
import { buildPrinterSlotCardStyles } from "./printer_slot_card_styles";

test("printer slot card styles stay empty when no swatch or assigned roll exists", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: null,
    hasAssignedSpool: false,
    hasSelectedTargetSpool: false,
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
    hasSelectedTargetSpool: true,
    resolvedTheme: "light",
  });

  assert.equal(styles.selectorStyle?.borderColor, "transparent");
  assert.equal(styles.currentRollStyle?.borderColor, "transparent");
  assert.equal(
    styles.selectorStyle?.boxShadow,
    "inset 0 1px 0 rgba(255, 255, 255, 0.45)",
  );
  assert.equal(
    styles.currentRollStyle?.boxShadow,
    "inset 0 1px 0 rgba(255, 255, 255, 0.45)",
  );
  assert.match(String(styles.actionStyle?.background), /linear-gradient/);
  assert.match(String(styles.panelStyle?.backgroundImage), /linear-gradient/);
});

test("printer slot card styles only show current roll emphasis for assigned slots", () => {
  const styles = buildPrinterSlotCardStyles({
    slotSwatchHex: "#f59e0b",
    hasAssignedSpool: false,
    hasSelectedTargetSpool: false,
    resolvedTheme: "dark",
  });

  assert.ok(styles.selectorStyle);
  assert.equal(styles.currentRollStyle, undefined);
  assert.ok(styles.actionStyle);
  assert.ok(styles.panelStyle);
});

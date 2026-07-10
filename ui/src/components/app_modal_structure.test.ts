import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("AppModal owns dialog naming, focus lifecycle, trapping and Escape close", () => {
  const appModal = readComponentSource("app_modal.tsx");
  const appModalContext = readComponentSource("app_modal_context.ts");
  const appModalFocus = readComponentSource("app_modal_focus.ts");
  const modalChrome = readComponentSource("modal_chrome.tsx");

  assert.match(appModal, /role="dialog"/);
  assert.match(appModal, /aria-modal="true"/);
  assert.match(appModal, /aria-label=\{ariaLabel\}/);
  assert.match(appModal, /aria-labelledby=\{ariaLabel \? undefined : titleId\}/);
  assert.match(appModal, /tabIndex=\{-1\}/);
  assert.match(appModal, /if \(!panel\.contains\(document\.activeElement\)\)/);
  assert.match(appModal, /modalFocusableElements\(panel\)\[0\] \?\? panel/);
  assert.match(appModal, /returnFocus\?\.isConnected/);
  assert.match(appModalFocus, /resolveAppModalTabTarget/);
  assert.match(appModal, /if \(event\.key === "Escape"\)/);
  assert.match(appModal, /if \(onBackdropClose\)/);
  assert.match(appModalContext, /AppModalTitleIdContext/);
  assert.match(appModalContext, /useAppModalTitleId/);
  assert.match(modalChrome, /useAppModalTitleId/);
  assert.match(modalChrome, /id=\{titleId\}/);
});

test("custom modal headers provide labels and SaveOnlyModal delegates optional cancellation", () => {
  const detailModal = readComponentSource("inventory_spool_detail_modal.tsx");
  const rfidModal = readComponentSource("inventory_rfid_capture_modal.tsx");
  const saveOnlyModal = readComponentSource("save_only_modal.tsx");

  assert.match(detailModal, /ariaLabel=\{`\$\{t\("inventory\.selectedRoll"/);
  assert.match(rfidModal, /ariaLabel=\{`\$\{t\("inventory\.rfidCaptureTitle"/);
  assert.match(saveOnlyModal, /ariaLabel=\{title\}/);
  assert.match(saveOnlyModal, /onCancel\?: \(\) => void/);
  assert.match(saveOnlyModal, /closeOnBackdrop=\{Boolean\(activeCancelHandler\)\}/);
  assert.match(saveOnlyModal, /onBackdropClose=\{activeCancelHandler\}/);
  assert.match(saveOnlyModal, /t\("common\.cancel", "Cancel"\)/);
  assert.doesNotMatch(saveOnlyModal, /window\.addEventListener\("keydown"/);
});

test("generic modal panels stay within the dynamic viewport and scroll from a visible top", () => {
  const appModal = readComponentSource("app_modal.tsx");
  const modalPanelClass = readComponentSource("modal_panel_class.ts");

  assert.match(appModal, /fixed inset-0 flex items-center justify-center/);
  for (const source of [appModal, modalPanelClass]) {
    assert.match(source, /max-h-\[calc\(100dvh-3rem\)\]/);
    assert.match(source, /overflow-y-auto/);
    assert.match(source, /overscroll-contain/);
  }
  assert.doesNotMatch(modalPanelClass, /w-full overflow-hidden/);
});

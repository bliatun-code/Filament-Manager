const VIEWPORT_PROPERTIES = [
  "--companion-overlay-top", "--companion-overlay-left",
  "--companion-overlay-width", "--companion-overlay-height",
];

// Keyboard and pinch zoom change the visual viewport without resizing layout.
// Keep only overlays inside that visible rectangle; never change page zoom.
export function createCompanionOverlayViewport({ windowRef, documentRef }) {
  const viewport = windowRef.visualViewport;
  const style = documentRef.documentElement.style;
  let active = false;
  let frame = null;
  let revealControl = false;

  function update() {
    if (!active) return;
    const width = viewport?.width || windowRef.innerWidth;
    const height = viewport?.height || windowRef.innerHeight;
    if (!(width > 0 && height > 0)) return;
    const values = [Math.max(0, viewport?.offsetTop || 0), Math.max(0, viewport?.offsetLeft || 0), width, height];
    VIEWPORT_PROPERTIES.forEach((name, index) => style.setProperty(name, `${values[index]}px`));
    if (!revealControl) return;
    revealControl = false;
    const control = documentRef.activeElement;
    if (!control?.matches?.("input, select, textarea, [contenteditable='true']")) return;
    const scroller = control.closest(".detail-modal-body, .task-sheet-body");
    if (!scroller) return;
    const field = control.getBoundingClientRect();
    const body = scroller.getBoundingClientRect();
    if (field.bottom > body.bottom - 12) scroller.scrollTop += field.bottom - body.bottom + 12;
    else if (field.top < body.top + 12) scroller.scrollTop -= body.top - field.top + 12;
  }

  function schedule(reveal = false) {
    if (!active) return;
    revealControl ||= reveal;
    if (frame !== null) return;
    frame = windowRef.requestAnimationFrame(() => { frame = null; update(); });
  }
  const resize = () => schedule(true);
  const scroll = () => schedule();
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", scroll);
  windowRef.addEventListener("resize", resize);
  documentRef.addEventListener("focusin", resize);

  function sync(nextActive) {
    active = Boolean(nextActive);
    if (active) { update(); schedule(true); return; }
    if (frame !== null) windowRef.cancelAnimationFrame(frame);
    frame = null;
    revealControl = false;
    VIEWPORT_PROPERTIES.forEach(name => style.removeProperty(name));
  }
  function dispose() {
    sync(false);
    viewport?.removeEventListener("resize", resize);
    viewport?.removeEventListener("scroll", scroll);
    windowRef.removeEventListener("resize", resize);
    documentRef.removeEventListener("focusin", resize);
  }
  return { sync, dispose };
}

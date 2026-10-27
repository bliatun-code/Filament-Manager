import test from "node:test";
import assert from "node:assert/strict";
import { createCompanionOverlayViewport } from "./companion_overlay_viewport.js";

function harness(withVisualViewport = true) {
  const properties = new Map();
  const frames = new Map();
  let nextFrame = 0;
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
  const windowRef = Object.assign(new EventTarget(), {
    innerWidth: 390, innerHeight: 844,
    visualViewport: withVisualViewport ? viewport : undefined,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const documentRef = Object.assign(new EventTarget(), {
    activeElement: null,
    documentElement: { style: {
      setProperty(name, value) { properties.set(name, value); },
      removeProperty(name) { properties.delete(name); },
    } },
  });
  return { viewport, windowRef, documentRef, properties,
    lifecycle: createCompanionOverlayViewport({ windowRef, documentRef }),
    flush() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
    pending: () => frames.size,
  };
}

test("keyboard resize and pan keep an overlay inside the visible rectangle and reveal its focused field", () => {
  const h = harness(); h.lifecycle.sync(true); h.flush();
  assert.equal(h.properties.get("--companion-overlay-height"), "844px");
  const scroller = { scrollTop: 20, getBoundingClientRect: () => ({ top: 180, bottom: 420 }) };
  h.documentRef.activeElement = { matches: () => true, closest: () => scroller, getBoundingClientRect: () => ({ top: 550, bottom: 600 }) };
  Object.assign(h.viewport, { height: 330, offsetTop: 110 });
  h.viewport.dispatchEvent(new Event("resize")); h.viewport.dispatchEvent(new Event("scroll"));
  assert.equal(h.pending(), 1); h.flush();
  assert.equal(h.properties.get("--companion-overlay-top"), "110px");
  assert.equal(h.properties.get("--companion-overlay-height"), "330px");
  assert.equal(scroller.scrollTop, 212);
  h.viewport.dispatchEvent(new Event("scroll")); h.flush();
  assert.equal(scroller.scrollTop, 212, "viewport scrolling does not repeatedly drag the form back to its focused field");
  h.lifecycle.dispose();
});

test("closing during keyboard animation cancels queued updates and never leaks overlay geometry into inventory", () => {
  const h = harness(); h.lifecycle.sync(true); h.flush();
  Object.assign(h.viewport, { height: 300, offsetTop: 140 });
  h.viewport.dispatchEvent(new Event("resize"));
  h.lifecycle.sync(false); h.flush();
  assert.equal(h.properties.size, 0);
  h.viewport.dispatchEvent(new Event("scroll")); h.viewport.dispatchEvent(new Event("resize")); h.flush();
  assert.equal(h.properties.size, 0); assert.equal(h.pending(), 0);
  Object.assign(h.viewport, { height: 844, offsetTop: 0 });
  h.lifecycle.sync(true); h.flush();
  assert.equal(h.properties.get("--companion-overlay-top"), "0px");
  assert.equal(h.properties.get("--companion-overlay-height"), "844px");
  h.lifecycle.dispose();
  h.viewport.dispatchEvent(new Event("resize")); h.windowRef.dispatchEvent(new Event("resize"));
  assert.equal(h.pending(), 0); assert.equal(h.properties.size, 0);
});

test("manual zoom uses visual viewport CSS pixels without changing the browser zoom", () => {
  const h = harness(); Object.assign(h.viewport, { width: 250, height: 380, offsetTop: 50, offsetLeft: 90, scale: 1.6 });
  h.lifecycle.sync(true); h.flush();
  assert.equal(h.properties.get("--companion-overlay-width"), "250px");
  assert.equal(h.properties.get("--companion-overlay-left"), "90px");
  assert.equal(h.viewport.scale, 1.6);
  h.lifecycle.dispose();
});

test("older browsers fall back to window dimensions and ignore invalid visual sizes", () => {
  const h = harness(false); h.lifecycle.sync(true); h.flush();
  h.windowRef.innerHeight = 340; h.windowRef.dispatchEvent(new Event("resize")); h.flush();
  assert.equal(h.properties.get("--companion-overlay-height"), "340px"); h.lifecycle.dispose();
  const invalid = harness(); invalid.viewport.height = -1; invalid.lifecycle.sync(true); invalid.flush();
  assert.equal(invalid.properties.size, 0); invalid.lifecycle.dispose();
});

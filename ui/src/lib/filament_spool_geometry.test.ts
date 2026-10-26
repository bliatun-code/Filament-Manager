import assert from "node:assert/strict";
import test from "node:test";
import { filamentSpoolGeometry, projectFilamentSpoolPoint } from "./filament_spool_geometry";

test("spool projection keeps points on the optical axis at the same image centre", () => {
  // Camera rays must converge; a non-orthogonal camera frame tilts circles and
  // their winding curves inconsistently even when each looks plausible alone.
  for (const factor of [-.5, 0, .25, .7]) {
    const [x,y] = projectFilamentSpoolPoint([-2.4 * factor, .35 * factor, 4.5 * factor]);
    assert.ok(Math.abs(x - 100) < 1e-9);
    assert.ok(Math.abs(y - 108) < 1e-9);
  }
});

test("equal-size physical end plates get smaller with distance in the perspective view", () => {
  const diameter = (axis:number) => {
    const upper = projectFilamentSpoolPoint([axis,1,0]);
    const lower = projectFilamentSpoolPoint([axis,-1,0]);
    return Math.hypot(upper[0]-lower[0],upper[1]-lower[1]);
  };
  const near=diameter(filamentSpoolGeometry.front);
  const far=diameter(filamentSpoolGeometry.rear);
  assert.ok(far < near);
  assert.ok(far / near > .8 && far / near < .95);
});

test("the spool surface and winding paths stay finite within the preview frame", () => {
  for(const d of [filamentSpoolGeometry.frontFace,filamentSpoolGeometry.rearFace,filamentSpoolGeometry.bodyClip,...filamentSpoolGeometry.windings,...filamentSpoolGeometry.threadLayers]) {
    assert.doesNotMatch(d,/NaN|Infinity|undefined/);
    const values=d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    for(let i=0;i<values.length;i+=2) {
      assert.ok(values[i] >= 0 && values[i] <= 200);
      assert.ok(values[i+1] >= 0 && values[i+1] <= 220);
    }
  }
});

test("round filament windings retain 1.75 mm pitch across the narrowed 63.75 mm winding bed", () => {
  assert.ok(Math.abs(filamentSpoolGeometry.filamentDiameter * 100 - 1.75) < 1e-12);
  const woundWidth = filamentSpoolGeometry.windings.length * filamentSpoolGeometry.filamentDiameter * 100;
  assert.ok(woundWidth <= 63.75 && 63.75 - woundWidth < 1.75);
});

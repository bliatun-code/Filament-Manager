type Point3 = readonly [number, number, number];

// Every ring, flange, opening and winding uses the same perspective camera.
// X is the spool axis; the camera sees its left end and the wound surface.
const CAMERA: Point3 = [-2.4, .35, 4.5];
const distance = Math.hypot(...CAMERA);
const forward = CAMERA.map(value => value / distance);
const horizontalLength = Math.hypot(CAMERA[0], CAMERA[2]);
const right: Point3 = [CAMERA[2] / horizontalLength, 0, -CAMERA[0] / horizontalLength];
const up: Point3 = [
  forward[1] * right[2],
  forward[2] * right[0] - forward[0] * right[2],
  -forward[1] * right[0],
];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const projectFilamentSpoolPoint = (point: Point3) => {
  const scale = 83 * distance / (distance - dot(point, forward));
  return [100 + dot(point, right) * scale, 108 - dot(point, up) * scale] as const;
};
const ringPoint = (x: number, radius: number, angle: number): Point3 =>
  [x, radius * Math.sin(angle), radius * Math.cos(angle)];
const path = (points: readonly Point3[], closed = true) =>
  points.map((point, i) => {
    const [x, y] = projectFilamentSpoolPoint(point);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + (closed ? "Z" : "");
const circle = (x: number, radius: number) => path(
  Array.from({ length: 100 }, (_, i) => ringPoint(x, radius, i * Math.PI * 2 / 100)),
);
const sector = (x: number, inner: number, outer: number, start: number, end: number) => path([
  ...Array.from({ length: 13 }, (_, i) => ringPoint(x, outer, start + (end - start) * i / 12)),
  ...Array.from({ length: 13 }, (_, i) => ringPoint(x, inner, end - (end - start) * i / 12)),
]);
// Narrow the axial dimension by 25%, preserving diameter and thread gauge.
const axialWidthScale = .75;
const front = -.49 * axialWidthScale;
const rear = .45 * axialWidthScale;
const bodyFront = -.435 * axialWidthScale;
const bodyRear = .415 * axialWidthScale;
const bodyRadius = .88;
const frontFace = circle(front, 1);
const rearFace = circle(rear, 1);
const light: Point3 = [-.27, .54, .8];
const halfLight = light.map((value, i) => value + forward[i]);
const halfLength = Math.hypot(...halfLight);
const half = halfLight.map(value => value / halfLength);
// The projected cylinder is convex. A silhouette hull avoids cancellation
// between front- and back-facing mesh panels inside the SVG clipping path.
const bodyPoints = [bodyFront, bodyRear].flatMap(x => Array.from({length:96}, (_, i) =>
  projectFilamentSpoolPoint(ringPoint(x, bodyRadius, i * Math.PI * 2 / 96)),
)).sort((a,b) => a[0] - b[0] || a[1] - b[1]);
type Point2 = readonly [number, number];
const cross = (o:Point2, a:Point2, b:Point2) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
const hullHalf = (points:Point2[]) => {
  const hull:Point2[]=[];
  for (const point of points) {
    while(hull.length>=2 && cross(hull[hull.length-2], hull[hull.length-1], point)<=0) hull.pop();
    hull.push(point);
  }
  return hull.slice(0,-1);
};
const bodyClip = [...hullHalf(bodyPoints), ...hullHalf([...bodyPoints].reverse())]
  .map(([x,y], i) => `${i===0?"M":"L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")+"Z";
const windingCenter = Math.atan2(CAMERA[1], CAMERA[2]);
const windingHalfAngle = Math.acos(bodyRadius / Math.hypot(CAMERA[1], CAMERA[2]));
// Model units are 100 mm: a 200 mm flange and round 1.75 mm filament.
// Follow a continuous helix, not crossed longitude/latitude lines on a cylinder.
const filamentDiameter = 1.75 / 100;
const filamentRadius = filamentDiameter / 2;
const windingCount = Math.floor((bodyRear - bodyFront) / filamentDiameter);
const windingStart = bodyFront + ((bodyRear - bodyFront) - windingCount * filamentDiameter) / 2;
const threadPoint = (turn: number, angle: number, profile: number): Point3 => {
  const advance = (angle - windingCenter) / (Math.PI * 2);
  const x = windingStart + (turn + .5 + advance) * filamentDiameter + Math.sin(profile) * filamentRadius;
  return ringPoint(x, bodyRadius - filamentRadius + Math.cos(profile) * filamentRadius, angle);
};
const threadArc = (turn: number, profile: number, reverse = false, move = "M") => {
  const start = windingCenter + (reverse ? windingHalfAngle : -windingHalfAngle);
  const end = windingCenter + (reverse ? -windingHalfAngle : windingHalfAngle);
  const point = (angle:number) => projectFilamentSpoolPoint(threadPoint(turn, angle, profile));
  const derivative = (angle:number) => {
    const before=point(angle-1e-5), after=point(angle+1e-5);
    return [(after[0]-before[0])/2e-5,(after[1]-before[1])/2e-5];
  };
  const format = (p:readonly number[]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  let d=move+format(point(start));
  // Four smooth Bézier segments describe the visible helix; no polygon edges
  // or long tessellated paths are needed for each fine thread.
  for(let i=0;i<4;i++) {
    const a=start+(end-start)*i/4, b=start+(end-start)*(i+1)/4;
    const pa=point(a), pb=point(b), da=derivative(a), db=derivative(b), step=(b-a)/3;
    d+=`C${format([pa[0]+da[0]*step,pa[1]+da[1]*step])} ${format([pb[0]-db[0]*step,pb[1]-db[1]*step])} ${format(pb)}`;
  }
  return d;
};
const wireProfiles = Array.from({ length: 5 }, (_, i) => {
  const start = -Math.PI / 2 + Math.PI * i / 5;
  const end = -Math.PI / 2 + Math.PI * (i + 1) / 5;
  const middle = (start + end) / 2;
  // Smooth illumination along the round wire, shared by every winding. There
  // are no transverse mesh edges to leave a woven or tyre-tread pattern.
  const stops = Array.from({ length: 11 }, (_, j) => {
    const angle = windingCenter + windingHalfAngle - 2 * windingHalfAngle * j / 10;
    const normal: Point3 = [Math.sin(middle), Math.cos(middle) * Math.sin(angle), Math.cos(middle) * Math.cos(angle)];
    const [,y] = projectFilamentSpoolPoint(ringPoint(0, bodyRadius, angle));
    return {
      offset: Math.max(0, Math.min(1, (y - 12) / 192)),
      diffuse: .24 + .76 * Math.max(0, dot(normal, light)),
      sheen: .012 + .18 * Math.max(0, dot(normal, half)) ** 14,
    };
  }).sort((a,b) => a.offset - b.offset);
  return { start, end, stops };
});
const threads = Array.from({ length: windingCount }, (_, turn) => wireProfiles.map(({start, end}) =>
  threadArc(turn,start)+threadArc(turn,end,true,"L")+"Z",
));
// Shared illumination allows all windings of one round-wire profile to be
// batched into a single SVG path, keeping large inventories lightweight.
const threadLayers = wireProfiles.map((_,profile) => threads.map(turn => turn[profile]).join(" "));
const windings = Array.from({length:windingCount}, (_, turn) => threadArc(turn,0));
const windows = Array.from({ length: 12 }, (_, i) => sector(
  front - .001, .49, .835, i * Math.PI * 2 / 12 + .075, (i + 1) * Math.PI * 2 / 12 - .075,
));
const hubWindows = Array.from({ length: 6 }, (_, i) => sector(
  front - .002, .37, .435, i * Math.PI * 2 / 6 + .13, (i + 1) * Math.PI * 2 / 6 - .13,
));
const spokes = Array.from({ length: 12 }, (_, i) => path([
  ringPoint(front - .003, .46, i * Math.PI * 2 / 12 + .018),
  ringPoint(front - .003, .87, i * Math.PI * 2 / 12 + .018),
], false));


export const filamentSpoolGeometry = { circle, front, rear, frontFace, rearFace, bodyClip, windings, threads, threadLayers, wireProfiles, filamentDiameter, windows, hubWindows, spokes };

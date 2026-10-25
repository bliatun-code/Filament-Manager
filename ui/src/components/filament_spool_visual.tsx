import { memo, useId } from "react";
import { hexToRgb, parseSwatchSpec } from "../lib/color_utils";
import { filamentSpoolGeometry } from "../lib/filament_spool_geometry";

type FilamentSpoolVisualProps = {
  color?: string | null;
  className?: string;
};

const { circle, front, rear, frontFace, rearFace, bodyClip, threadLayers, wireProfiles, windows, hubWindows, spokes } = filamentSpoolGeometry;

// Constant neutral lighting supports comparison; the neighbouring flat swatch
// retains the stored colour without simulated lighting or inferred material finish.
export const FilamentSpoolVisual = memo(function FilamentSpoolVisual({ color, className }: FilamentSpoolVisualProps) {
  const id = useId().replace(/:/g, "");
  const rgb = hexToRgb(color) ?? [135, 146, 158];
  const spec = parseSwatchSpec(color);
  const base = `rgb(${rgb.join(" ")})`;
  const url = (name: string) => `url(#${id}-${name})`;
  const litColor = (diffuse: number, sheen: number) =>
    `rgb(${rgb.map(value => Math.round(Math.min(255, value * diffuse + (255 - value) * sheen))).join(" ")})`;
  return <svg className={className} viewBox="0 0 200 220" aria-hidden="true" focusable="false" data-filament-spool="" data-color={base}>
    <defs>
      <radialGradient id={`${id}-face`} cx=".27" cy=".18" r=".9">
        <stop stopColor="#30383f"/><stop offset=".43" stopColor="#151b20"/><stop offset="1" stopColor="#090d11"/>
      </radialGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".8" y2="1">
        <stop stopColor="#74818b"/><stop offset=".16" stopColor="#303b44"/><stop offset=".6" stopColor="#11181e"/><stop offset="1" stopColor="#3d4750"/>
      </linearGradient>
      <linearGradient id={`${id}-axial`}>
        <stop stopColor="#000" stopOpacity=".47"/><stop offset=".28" stopColor="#000" stopOpacity="0"/><stop offset=".72" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".3"/>
      </linearGradient>
      <linearGradient id={`${id}-volume`} gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="204">
        <stop stopColor={litColor(.61,.01)}/><stop offset=".25" stopColor={litColor(.98,.06)}/><stop offset=".48" stopColor={litColor(.87,.02)}/><stop offset=".75" stopColor={litColor(.55,.01)}/><stop offset="1" stopColor={litColor(.24,.005)}/>
      </linearGradient>
      {wireProfiles.map((profile,i)=><linearGradient key={i} id={`${id}-wire-${i}`} gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="204">
        {profile.stops.map((stop,j)=><stop key={j} offset={stop.offset}
          stopColor={spec.kind==="solid" ? litColor(stop.diffuse,stop.sheen) : "#000"}
          stopOpacity={spec.kind==="solid" ? 1 : 1-stop.diffuse}/>) }
      </linearGradient>)}
      <linearGradient id={`${id}-wire-shine`} gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="204">
        {wireProfiles[2].stops.map((stop,i)=><stop key={i} offset={stop.offset} stopColor="#fff" stopOpacity={stop.sheen}/>) }
      </linearGradient>
      <linearGradient id={`${id}-multicolor`} gradientUnits="userSpaceOnUse" x1="75" y1="70" x2="158" y2="90">
        {spec.colors.flatMap((c, i) => spec.kind === "multi"
          ? [<stop key={`${i}-a`} offset={i / spec.colors.length} stopColor={c}/>, <stop key={`${i}-b`} offset={(i + 1) / spec.colors.length} stopColor={c}/>]
          : [<stop key={i} offset={spec.colors.length === 1 ? 0 : i / (spec.colors.length - 1)} stopColor={c}/>])}
      </linearGradient>
      <radialGradient id={`${id}-shadow`}>
        <stop stopColor="#000" stopOpacity=".58"/><stop offset="1" stopColor="#000" stopOpacity="0"/>
      </radialGradient>
      <clipPath id={`${id}-body`}><path d={bodyClip}/></clipPath>
    </defs>
    <ellipse cx="104" cy="202" rx="79" ry="12" fill={url("shadow")}/>
    <path d={circle(rear + .035, 1)} fill="#070c10" stroke="#020508" strokeWidth="1.4"/>
    <path d={rearFace} fill={url("face")} stroke={url("rim")} strokeWidth="2"/>
    <path d={circle(rear, .96)} fill="none" stroke="#58646e" strokeOpacity=".55" strokeWidth=".8"/>
    <path d={circle(rear, .905)} fill="none" stroke="#070d12" strokeWidth="2.4"/>
    <g clipPath={url("body")}>
      <path d={bodyClip} fill={url(spec.kind === "solid" ? "volume" : "multicolor")}/>
      {threadLayers.map((d,i)=><path key={i} d={d} fill={url(`wire-${i}`)} />)}
      {spec.kind!=="solid" ? <path d={threadLayers[2]} fill={url("wire-shine")}/> : null}
      <rect x="20" y="10" width="160" height="195" fill={url("axial")}/>
    </g>
    <path d={circle(front + .04, 1)} fill="#060b10" stroke="#070c10" strokeWidth="2.2"/>
    <path d={frontFace} fill={url("face")} stroke={url("rim")} strokeWidth="1.35"/>
    <path d={circle(front, .967)} fill="none" stroke="#84919b" strokeOpacity=".26" strokeWidth=".6"/>
    <path d={circle(front, .925)} fill="none" stroke="#050a0e" strokeWidth="1.1"/>
    {windows.map((d, i) => <path key={i} d={d} fill="#03080c" stroke="#26323a" strokeWidth=".65"/>)}
    {hubWindows.map((d,i)=><path key={i} d={d} fill="#05090c" stroke="#273139" strokeWidth=".5"/>)}
    {spokes.map((d, i) => <path key={i} d={d} fill="none" stroke="#56616a" strokeOpacity=".2" strokeWidth=".8"/>)}
    <path d={circle(front, .87)} fill="none" stroke="#4d5b66" strokeOpacity=".4" strokeWidth=".6"/>
    <path d={circle(front, .33)} fill={url("face")} stroke="#46535e" strokeWidth=".7"/>
    <path d={circle(front - .007, .245)} fill="#02070a" stroke="#0b1218" strokeWidth="1.1"/>
    <path d={circle(front, .255)} fill="none" stroke="#61727f" strokeOpacity=".4" strokeWidth=".6"/>
  </svg>;
});

export type FilamentLabelProfileId = "ptouch-24" | "compact" | "standard" | "expanded";

export type FilamentLabelProfile = {
  id: FilamentLabelProfileId;
  widthMm: number;
  heightMm: number;
  title: string;
  description: string;
};

export const FILAMENT_LABEL_PROFILES: readonly FilamentLabelProfile[] = [
  {
    id: "ptouch-24",
    widthMm: 60,
    heightMm: 24,
    title: "P-Touch 24 mm",
    description: "Uses the full tape height",
  },
  {
    id: "compact",
    widthMm: 50,
    heightMm: 25,
    title: "Compact",
    description: "Short landscape label",
  },
  {
    id: "standard",
    widthMm: 60,
    heightMm: 30,
    title: "Standard",
    description: "More room for details",
  },
  {
    id: "expanded",
    widthMm: 75,
    heightMm: 40,
    title: "Expanded",
    description: "Largest text and QR",
  },
] as const;

export function filamentLabelProfile(profileId: FilamentLabelProfileId): FilamentLabelProfile {
  return (
    FILAMENT_LABEL_PROFILES.find((profile) => profile.id === profileId) ??
    FILAMENT_LABEL_PROFILES[0]
  );
}

export function filamentLabelPixelSize(profileId: FilamentLabelProfileId): {
  width: number;
  height: number;
} {
  const profile = filamentLabelProfile(profileId);
  return {
    width: Math.round((profile.widthMm / 25.4) * 300),
    height: Math.round((profile.heightMm / 25.4) * 300),
  };
}

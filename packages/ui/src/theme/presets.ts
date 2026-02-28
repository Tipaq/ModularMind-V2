export interface ThemePreset {
  name: string;
  label: string;
  hue: number;
  saturation: number;
}

export const PRESETS: ThemePreset[] = [
  { name: "default", label: "Violet", hue: 262, saturation: 83 },
  { name: "ocean", label: "Ocean", hue: 210, saturation: 80 },
  { name: "forest", label: "Forest", hue: 150, saturation: 60 },
  { name: "sunset", label: "Sunset", hue: 25, saturation: 90 },
  { name: "rose", label: "Rose", hue: 340, saturation: 75 },
];

export function getPreset(name: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.name === name);
}

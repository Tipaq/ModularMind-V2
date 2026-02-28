/**
 * Generate CSS variable overrides for a given accent hue + saturation.
 * Returns the HSL triplets (space-separated) for --primary and --ring tokens.
 */
export function generateAccentTokens(
  hue: number,
  saturation: number,
  isDark: boolean,
): Record<string, string> {
  const lightness = isDark ? 65 : 58;
  const primary = `${hue} ${saturation}% ${lightness}%`;
  return {
    "--primary": primary,
    "--ring": primary,
    "--sidebar-ring": primary,
  };
}

/**
 * Script source to inject in <head> to prevent FOUC.
 * Reads localStorage before first paint and sets the `dark` class + accent vars.
 */
export const ANTI_FOUC_SCRIPT = `
(function(){
  try {
    var mode = localStorage.getItem("mm-theme-mode");
    var dark = mode === "dark" || (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");

    var hue = localStorage.getItem("mm-theme-hue");
    var sat = localStorage.getItem("mm-theme-saturation");
    if (hue && sat) {
      var l = dark ? 65 : 58;
      var v = hue + " " + sat + "% " + l + "%";
      document.documentElement.style.setProperty("--primary", v);
      document.documentElement.style.setProperty("--ring", v);
      document.documentElement.style.setProperty("--sidebar-ring", v);
    }
  } catch(e) {}
})();
`;

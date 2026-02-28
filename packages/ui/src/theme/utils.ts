/**
 * Generate CSS variable overrides for a given accent hue + saturation.
 * Returns HSL triplets (space-separated) for --primary, --secondary, and --ring tokens.
 *
 * Secondary is derived from primary: hue shifted +40°, reduced saturation, adjusted lightness.
 */
export function generateAccentTokens(
  hue: number,
  saturation: number,
  isDark: boolean,
): Record<string, string> {
  const lightness = isDark ? 65 : 58;
  const primary = `${hue} ${saturation}% ${lightness}%`;

  const secHue = (hue + 40) % 360;
  const secSat = Math.round(Math.max(20, saturation * 0.5));
  const secLight = isDark ? 20 : 92;
  const secFgLight = isDark ? 90 : 15;
  const secondary = `${secHue} ${secSat}% ${secLight}%`;
  const secondaryFg = `${secHue} ${secSat}% ${secFgLight}%`;

  return {
    "--primary": primary,
    "--ring": primary,
    "--sidebar-ring": primary,
    "--secondary": secondary,
    "--secondary-foreground": secondaryFg,
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
      var h = Number(hue), s = Number(sat);
      var l = dark ? 65 : 58;
      var v = h + " " + s + "% " + l + "%";
      document.documentElement.style.setProperty("--primary", v);
      document.documentElement.style.setProperty("--ring", v);
      document.documentElement.style.setProperty("--sidebar-ring", v);

      var sh = (h + 40) % 360;
      var ss = Math.round(Math.max(20, s * 0.5));
      var sl = dark ? 20 : 92;
      var sfl = dark ? 90 : 15;
      document.documentElement.style.setProperty("--secondary", sh + " " + ss + "% " + sl + "%");
      document.documentElement.style.setProperty("--secondary-foreground", sh + " " + ss + "% " + sfl + "%");
    }
  } catch(e) {}
})();
`;

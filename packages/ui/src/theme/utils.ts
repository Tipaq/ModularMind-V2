/**
 * Generate CSS variable overrides for a given accent hue + saturation.
 * Returns HSL triplets (space-separated) for --primary, --secondary, and --ring tokens.
 *
 * Secondary is a neighboring color on the wheel: +15° hue shift, slightly reduced saturation.
 */
export function generateAccentTokens(
  hue: number,
  saturation: number,
  isDark: boolean,
): Record<string, string> {
  const lightness = isDark ? 65 : 58;
  const primary = `${hue} ${saturation}% ${lightness}%`;

  const secHue = (hue + 15) % 360;
  const secSat = Math.round(Math.max(30, saturation * 0.7));
  const secLight = isDark ? 55 : 50;
  const secFgLight = isDark ? 95 : 98;
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

      var sh = (h + 15) % 360;
      var ss = Math.round(Math.max(30, s * 0.7));
      var sl = dark ? 55 : 50;
      var sfl = dark ? 95 : 98;
      document.documentElement.style.setProperty("--secondary", sh + " " + ss + "% " + sl + "%");
      document.documentElement.style.setProperty("--secondary-foreground", sh + " " + ss + "% " + sfl + "%");
    }
  } catch(e) { if(typeof console!=="undefined") console.warn("[mm-theme]",e); }
})();
`;

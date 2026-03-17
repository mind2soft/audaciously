/**
 * resolveColor — CSS custom property → computed RGB resolver with caching.
 *
 * Uses a persistent off-screen phantom element to resolve any CSS expression
 * (including custom properties, relative colors, color-mix) to a concrete
 * rgb()/rgba() string via the browser's own style engine.
 *
 * Results are cached by (varName + options) so each unique combination is
 * resolved only once per page lifetime. Call clearColorCache() after a theme
 * change to force re-resolution.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolveColorOptions {
  /** Alpha multiplier 0–1. Applied via color-mix with transparent. */
  opacity?: number;
  /** Hue rotation in degrees. Applied via CSS relative-color oklch syntax. */
  hue?: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, string>();

/** Deterministic cache key from varName + options (omits absent fields). */
function cacheKey(varName: string, options: ResolveColorOptions | undefined): string {
  if (!options) return varName;
  let k = varName;
  if (options.opacity !== undefined) k += `|o${options.opacity}`;
  if (options.hue !== undefined) k += `|h${options.hue}`;
  return k;
}

/** Remove all cached entries. Call this after a theme change. */
export function clearColorCache(): void {
  cache.clear();
}

// ── Phantom element ───────────────────────────────────────────────────────────

let phantomEl: HTMLDivElement | null = null;

function getPhantomEl(): HTMLDivElement {
  if (!phantomEl) {
    phantomEl = document.createElement("div");
    phantomEl.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0";
    document.body.appendChild(phantomEl);
  }
  return phantomEl;
}

// ── CSS expression builder ────────────────────────────────────────────────────

function buildCssExpr(varName: string, options: ResolveColorOptions | undefined): string {
  const { opacity, hue } = options ?? {};

  // Base: plain var() or hue-rotated via CSS relative-color syntax
  const base =
    hue !== undefined ? `oklch(from var(${varName}) l c calc(h + ${hue}))` : `var(${varName})`;

  // Opacity: color-mix with transparent
  if (opacity !== undefined && opacity !== 1) {
    return `color-mix(in srgb, ${base} ${Math.round(opacity * 100)}%, transparent)`;
  }

  return base;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves a CSS custom property (and optional transformations) to a concrete
 * rgb()/rgba() string using the browser's own style engine.
 *
 * @param varName  CSS custom property name, e.g. `"--color-primary"`
 * @param options  Optional opacity (0–1) and/or hue rotation (degrees)
 * @returns        Resolved `rgb(r, g, b)` or `rgba(r, g, b, a)` string
 */
export function resolveColor(varName: string, options?: ResolveColorOptions): string {
  const key = cacheKey(varName, options);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const el = getPhantomEl();
  el.style.color = buildCssExpr(varName, options);
  const resolved = getComputedStyle(el).color;
  el.style.removeProperty("color");

  cache.set(key, resolved);
  return resolved;
}

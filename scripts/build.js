#!/usr/bin/env node

/**
 * Build script for Firefox theme manifests.
 *
 * Walks `themes/<collection>/<theme>/manifest.json`, converts every color
 * value inside `theme.colors` and `dark_theme.colors` into an RGB(A) array,
 * and writes the result to `dist/<collection>/<theme>/manifest.json`.
 *
 * Supported input formats per color value:
 *   - "oklch(L C H)" or "oklch(from oklch(L C H) L2 c h)"
 *   - hex strings ("#rgb", "#rrggbb", "#rrggbbaa")
 *   - named CSS colors handled by chroma-js
 *   - already-RGB arrays of 3 or 4 numbers (passed through unchanged)
 *
 * Alpha-aware: returns [r, g, b] when alpha === 1, [r, g, b, a] otherwise.
 */

const fs = require('fs');
const path = require('path');
const chroma = require('chroma-js');
const { findThemeManifests } = require('./lib/themes');

const REPO_ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');
const DIST_DIR = path.join(REPO_ROOT, 'dist');

function rgbaArrayFromChroma(color) {
    const [r, g, b, a] = color.rgba();
    const ri = Math.round(r);
    const gi = Math.round(g);
    const bi = Math.round(b);
    // chroma.oklch() returns NaN alpha when none was given; treat as opaque.
    if (!Number.isFinite(a) || a >= 1) {
        return [ri, gi, bi];
    }
    return [ri, gi, bi, Number(a.toFixed(3))];
}

function parseOklchFromSyntax(str) {
    // "oklch(from oklch(L C H) ...)": for parity with the shipped XPIs, use the
    // INNER L/C/H and ignore the outer relative modifications.
    const fromMatch = str.match(/^oklch\(\s*from\s+oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
    if (fromMatch) {
        return chroma.oklch(parseFloat(fromMatch[1]), parseFloat(fromMatch[2]), parseFloat(fromMatch[3]));
    }
    // "oklch(L C H)"
    const match = str.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
    if (match) {
        return chroma.oklch(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
    }
    return null;
}

function convertColorValue(value, keyPath) {
    if (Array.isArray(value)) {
        // Already an RGB(A) array; pass through.
        return value;
    }
    if (typeof value !== 'string') {
        console.warn(`  Warning: non-string color at ${keyPath}: ${JSON.stringify(value)}`);
        return value;
    }

    const trimmed = value.trim();

    if (trimmed.toLowerCase().startsWith('oklch(')) {
        const color = parseOklchFromSyntax(trimmed);
        if (color) {
            return rgbaArrayFromChroma(color);
        }
        console.warn(`  Warning: unparseable oklch at ${keyPath}: ${trimmed}`);
        return value;
    }

    try {
        return rgbaArrayFromChroma(chroma(trimmed));
    } catch (err) {
        console.warn(`  Warning: chroma could not parse color at ${keyPath}: ${trimmed} (${err.message})`);
        return value;
    }
}

function convertColorsMap(colors, basePath) {
    const out = {};
    for (const [key, value] of Object.entries(colors)) {
        out[key] = convertColorValue(value, `${basePath}.${key}`);
    }
    return out;
}

function buildManifest(manifest) {
    const out = { ...manifest };
    if (out.theme && out.theme.colors) {
        out.theme = {
            ...out.theme,
            colors: convertColorsMap(out.theme.colors, 'theme.colors'),
        };
    }
    if (out.dark_theme && out.dark_theme.colors) {
        out.dark_theme = {
            ...out.dark_theme,
            colors: convertColorsMap(out.dark_theme.colors, 'dark_theme.colors'),
        };
    }
    return out;
}

function main() {
    const manifests = findThemeManifests(THEMES_DIR);
    if (manifests.length === 0) {
        console.log('No theme manifests found under themes/');
        process.exit(1);
    }

    console.log(`Building ${manifests.length} theme manifest(s)...`);
    for (const { collection, theme, sourcePath } of manifests) {
        const relative = path.join(collection, theme, 'manifest.json');
        console.log(`  ${relative}`);
        const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const built = buildManifest(source);
        const destPath = path.join(DIST_DIR, relative);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, JSON.stringify(built, null, 2) + '\n');
    }
    console.log(`Wrote ${manifests.length} manifest(s) to ${path.relative(REPO_ROOT, DIST_DIR)}/`);
}

if (require.main === module) {
    main();
}

module.exports = { buildManifest, convertColorValue };

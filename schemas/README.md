# Schemas

## `firefox-theme.schema.json`

A hand-authored Draft 2020-12 JSON Schema for static-theme manifests. Used by `scripts/validate.js` and the `Themes / manifest validation` GitHub Action to fail PRs that introduce malformed `themes/<collection>/<theme>/manifest.json` files.

### Source of truth

Upstream lives in mozilla-central at:

```
toolkit/components/extensions/schemas/theme.json
```

That file is in Mozilla's internal **WebExtensions schema format** (an array of `namespace` objects using `$extend`, `id`, `choices`, and `"optional": true`), which is *not* compatible with standard JSON Schema validators like ajv. The file in this directory is a hand-translated mirror of the relevant subset (`ThemeColor`, `ThemeType.colors`, `ThemeType.properties`, `ThemeType.images`, and `ThemeManifest`).

### Intentional divergences

1. **`themeColor.oneOf[0]` (the string variant) has no pattern.** Source manifests in this repo author colors as `oklch(...)` / `oklch(from oklch(...) ...)`. Firefox itself doesn't accept those strings, but `scripts/build.js` resolves them into RGB arrays before shipping. The schema must accept them.
2. **`themeColors.additionalProperties: false`.** Upstream allows any color-key name as long as the value is a `ThemeColor`. We reject unknown keys to catch typos in PRs. If Firefox adds a new color key, add it to the enum in the same PR that uses it.

### How to re-sync

1. Open `toolkit/components/extensions/schemas/theme.json` in a current mozilla-central checkout or on [searchfox](https://searchfox.org/mozilla-central/source/toolkit/components/extensions/schemas/theme.json).
2. Compare `ThemeType.colors.properties` against `$defs.themeColors.properties` here, then add or remove keys to match. Watch for `"deprecated"` markers upstream and skip those keys.
3. Compare `ThemeType.properties.properties` and `ThemeColor.choices` for any new variants.
4. Run `npm run validate` after editing to confirm existing manifests still pass.

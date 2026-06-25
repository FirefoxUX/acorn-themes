#!/usr/bin/env node

/**
 * Validates every themes/<collection>/<theme>/manifest.json against
 * schemas/firefox-theme.schema.json (Draft 2020-12) and enforces that
 * browser_specific_settings.gecko.id is unique across all themes.
 *
 * When run with FEEDBACK_PATH set (the GitHub workflow does this), failures
 * are also serialised to that path as {title, summary, body} JSON for the
 * post-feedback composite action to render as a sticky PR comment.
 *
 * Exit code: 0 if everything passes, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const { findThemeManifests } = require('./lib/themes');

const REPO_ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'firefox-theme.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));

function relPath(p) {
    return path.relative(REPO_ROOT, p);
}

function formatAjvError(err) {
    const where = err.instancePath || '(root)';
    return `${where} ${err.message}`;
}

function main() {
    const manifests = findThemeManifests(THEMES_DIR);

    if (manifests.length === 0) {
        console.error(`No theme manifests found under ${relPath(THEMES_DIR)}/`);
        process.exit(1);
    }

    // failuresByPath: relative manifest path -> array of human-readable failure strings
    const failuresByPath = new Map();
    const addFailure = (manifestRel, message) => {
        if (!failuresByPath.has(manifestRel)) {
            failuresByPath.set(manifestRel, []);
        }
        failuresByPath.get(manifestRel).push(message);
    };

    // idOccurrences: gecko id -> array of relative manifest paths claiming it
    const idOccurrences = new Map();

    for (const { sourcePath } of manifests) {
        const rel = relPath(sourcePath);
        const raw = fs.readFileSync(sourcePath, 'utf8');

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            addFailure(rel, `JSON parse error: ${err.message}`);
            continue;
        }

        if (!validate(parsed)) {
            for (const err of validate.errors) {
                addFailure(rel, formatAjvError(err));
            }
            continue;
        }

        const id = parsed.browser_specific_settings?.gecko?.id;
        if (typeof id === 'string' && id.length > 0) {
            if (!idOccurrences.has(id)) {
                idOccurrences.set(id, []);
            }
            idOccurrences.get(id).push(rel);
        }
    }

    // Uniqueness check across all schema-valid manifests.
    const duplicateIds = [];
    for (const [id, paths] of idOccurrences) {
        if (paths.length > 1) {
            duplicateIds.push({ id, paths });
            for (const p of paths) {
                addFailure(
                    p,
                    `gecko id "${id}" is reused by: ${paths.filter((q) => q !== p).join(', ')}`,
                );
            }
        }
    }

    const hasFailures = failuresByPath.size > 0;

    // Human-readable log to stdout regardless, so the Actions log stands alone.
    if (!hasFailures) {
        console.log(`${manifests.length} manifest(s) validated successfully.`);
        return;
    }

    console.error(`Validation failed for ${failuresByPath.size} manifest(s):`);
    for (const [p, messages] of failuresByPath) {
        console.error(`\n  ${p}`);
        for (const m of messages) {
            console.error(`    - ${m}`);
        }
    }

    // Write feedback JSON for the post-feedback action.
    const feedbackPath = process.env.FEEDBACK_PATH;
    if (feedbackPath) {
        const failingCount = failuresByPath.size;
        const title =
            failingCount === 1
                ? '1 theme manifest failed validation'
                : `${failingCount} theme manifests failed validation`;
        const summary =
            failingCount === 1
                ? '1 manifest needs fixes. See the comment for details.'
                : `${failingCount} manifests need fixes. See the comment for details.`;

        const bodyParts = [];
        for (const [p, messages] of failuresByPath) {
            bodyParts.push(`**\`${p}\`**`);
            for (const m of messages) {
                bodyParts.push(`- ${m}`);
            }
            bodyParts.push('');
        }
        if (duplicateIds.length > 0) {
            bodyParts.push(
                'Each theme must declare a unique `browser_specific_settings.gecko.id`. ' +
                    'Generate a new UUID (e.g. `uuidgen`) for any new theme and brace it like `{xxxx-...}`.',
            );
        }

        fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
        fs.writeFileSync(
            feedbackPath,
            JSON.stringify({ title, summary, body: bodyParts.join('\n') }, null, 2),
        );
    }

    process.exit(1);
}

if (require.main === module) {
    main();
}

module.exports = { main };

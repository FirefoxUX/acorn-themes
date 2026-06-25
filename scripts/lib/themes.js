const fs = require('fs');
const path = require('path');

function findThemeManifests(themesDir) {
    const results = [];
    if (!fs.existsSync(themesDir)) {
        return results;
    }
    for (const collection of fs.readdirSync(themesDir, { withFileTypes: true })) {
        if (!collection.isDirectory()) continue;
        const collectionDir = path.join(themesDir, collection.name);
        for (const theme of fs.readdirSync(collectionDir, { withFileTypes: true })) {
            if (!theme.isDirectory()) continue;
            const manifestPath = path.join(collectionDir, theme.name, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                results.push({
                    collection: collection.name,
                    theme: theme.name,
                    sourcePath: manifestPath,
                });
            }
        }
    }
    return results;
}

module.exports = { findThemeManifests };

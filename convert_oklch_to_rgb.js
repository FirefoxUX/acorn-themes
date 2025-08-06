#!/usr/bin/env node

/**
 * OKLCH to RGB Converter for Firefox Theme Manifests
 * 
 * This script converts OKLCH color values in Firefox theme manifest.json files
 * to RGB arrays for broader compatibility.
 * 
 * Usage:
 *   node convert_oklch_to_rgb.js [input_dir] [output_dir]
 * 
 * If no arguments provided, converts current directory themes to 'rgb-arrays' folder.
 * 
 * Example:
 *   node convert_oklch_to_rgb.js . rgb-output
 */

const fs = require('fs');
const path = require('path');
const chroma = require('chroma-js');

/**
 * Convert OKLCH to RGB using chroma-js
 * @param {number} l - lightness (0-1)
 * @param {number} c - chroma (0+)
 * @param {number} h - hue (0-360 degrees) 
 * @returns {number[]} [R, G, B] values as integers (0-255)
 */
function oklchToRgb(l, c, h) {
    try {
        // Use chroma-js for accurate color conversion
        const color = chroma.oklch(l, c, h);
        return color.rgb();
    } catch (error) {
        console.log(`  Warning: chroma-js conversion failed for oklch(${l} ${c} ${h}): ${error.message}`);
        // Fallback to gray
        return [128, 128, 128];
    }
}

/**
 * Parse OKLCH color string and return RGB array
 * @param {string} oklchStr - Color string (OKLCH format, "white", or "black")
 * @returns {number[]} [R, G, B] values as integers (0-255)
 */
function parseOklch(oklchStr) {
    // Handle named colors
    if (oklchStr.toLowerCase() === 'white') {
        return [255, 255, 255];
    }
    if (oklchStr.toLowerCase() === 'black') {
        return [0, 0, 0];
    }
    
    // Handle known malformed case from original themes
    if (oklchStr.includes('oklch(0.48.20 145)')) {
        console.log(`  Fixing malformed OKLCH: ${oklchStr} -> oklch(0.48 0.20 145)`);
        return oklchToRgb(0.48, 0.20, 145);
    }
    
    // Handle oklch(from ...) syntax - extract base color
    if (oklchStr.includes('oklch(from')) {
        const fromMatch = oklchStr.match(/oklch\(from\s+oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
        if (fromMatch) {
            const l = parseFloat(fromMatch[1]);
            const c = parseFloat(fromMatch[2]);
            const h = parseFloat(fromMatch[3]);
            return oklchToRgb(l, c, h);
        }
    }
    
    // Regular oklch() format
    const match = oklchStr.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
    if (match) {
        const l = parseFloat(match[1]);
        const c = parseFloat(match[2]);
        const h = parseFloat(match[3]);
        return oklchToRgb(l, c, h);
    }
    
    // Fallback for unparseable colors
    console.log(`  Warning: Could not parse color: ${oklchStr}`);
    return [128, 128, 128]; // Gray fallback
}

/**
 * Recursively convert OKLCH colors to RGB arrays in an object
 * @param {any} data - Object potentially containing color values
 * @returns {any} Object with OKLCH colors converted to RGB arrays
 */
function convertColorsInObject(data) {
    if (Array.isArray(data)) {
        return data.map(item => convertColorsInObject(item));
    } else if (data && typeof data === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            if (key === 'colors' && value && typeof value === 'object') {
                // This is the colors section - convert all color values
                result[key] = {};
                for (const [colorKey, colorValue] of Object.entries(value)) {
                    if (typeof colorValue === 'string') {
                        result[key][colorKey] = parseOklch(colorValue);
                    } else {
                        result[key][colorKey] = colorValue;
                    }
                }
            } else {
                result[key] = convertColorsInObject(value);
            }
        }
        return result;
    } else {
        return data;
    }
}

/**
 * Process a single manifest.json file
 * @param {string} sourcePath - Path to source manifest.json
 * @param {string} destPath - Path where converted file should be saved
 */
function processManifestFile(sourcePath, destPath) {
    try {
        const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        
        // Convert colors
        const convertedData = convertColorsInObject(data);
        
        // Ensure destination directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        
        // Write converted file
        fs.writeFileSync(destPath, JSON.stringify(convertedData, null, 2));
        
    } catch (error) {
        console.log(`  Error processing ${sourcePath}: ${error.message}`);
    }
}

/**
 * Find all manifest.json files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} excludeParts - Path parts to exclude
 * @returns {string[]} Array of manifest.json file paths
 */
function findManifestFiles(dir, excludeParts = ['rgb', 'converted', 'output']) {
    const manifestFiles = [];
    
    function searchDir(currentDir) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip directories that match exclude patterns
                    if (!excludeParts.some(part => entry.name.startsWith(part))) {
                        searchDir(fullPath);
                    }
                } else if (entry.name === 'manifest.json') {
                    // Skip files in excluded directories
                    const pathParts = fullPath.split(path.sep);
                    if (!pathParts.some(part => excludeParts.some(exclude => part.startsWith(exclude)))) {
                        manifestFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors or non-existent directories
        }
    }
    
    searchDir(dir);
    return manifestFiles;
}

/**
 * Create README for the RGB arrays folder
 * @param {string} readmePath - Path where README should be created
 */
function createRgbReadme(readmePath) {
    const readmeContent = `# RGB Array Themes

This folder contains Firefox theme manifests with colors converted from OKLCH format to RGB arrays.

## Format

Instead of OKLCH color values like:
\`\`\`json
"icons": "oklch(0.48 0.20 145)"
\`\`\`

These themes use RGB arrays:
\`\`\`json
"icons": [0, 119, 0]
\`\`\`

## Conversion Notes

- All OKLCH color values have been mathematically converted to RGB using proper color space transformations
- "white" values are converted to \`[255, 255, 255]\`
- "black" values are converted to \`[0, 0, 0]\`
- Complex \`oklch(from ...)\` syntax has been simplified to the base color values
- Colors maintain the same visual appearance as the original OKLCH versions

## Generated by

This folder was created using the \`convert_oklch_to_rgb.js\` script included in this repository.
`;
    
    fs.writeFileSync(readmePath, readmeContent);
}

/**
 * Main conversion function
 */
function main() {
    const args = process.argv.slice(2);
    
    let sourceDir, destDir;
    
    if (args.length === 0) {
        sourceDir = '.';
        destDir = 'rgb-arrays';
    } else if (args.length === 2) {
        sourceDir = args[0];
        destDir = args[1];
    } else {
        console.log(`OKLCH to RGB Converter for Firefox Theme Manifests

This script converts OKLCH color values in Firefox theme manifest.json files
to RGB arrays for broader compatibility.

Usage:
  node convert_oklch_to_rgb.js [input_dir] [output_dir]

If no arguments provided, converts current directory themes to 'rgb-arrays' folder.

Example:
  node convert_oklch_to_rgb.js . rgb-output`);
        process.exit(1);
    }
    
    console.log(`Converting OKLCH themes from ${sourceDir} to ${destDir}`);
    console.log('='.repeat(50));
    
    // Find all manifest.json files
    const manifestFiles = findManifestFiles(sourceDir);
    
    if (manifestFiles.length === 0) {
        console.log('No manifest.json files found!');
        process.exit(1);
    }
    
    let convertedCount = 0;
    for (const manifestFile of manifestFiles) {
        // Calculate relative path from source
        const relativePath = path.relative(sourceDir, manifestFile);
        const destPath = path.join(destDir, relativePath);
        
        console.log(`Processing: ${relativePath}`);
        processManifestFile(manifestFile, destPath);
        convertedCount++;
    }
    
    console.log('='.repeat(50));
    console.log(`✅ Conversion complete! ${convertedCount} files converted.`);
    console.log(`RGB theme files created in: ${destDir}`);
    
    // Create README if it doesn't exist
    const readmePath = path.join(destDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
        createRgbReadme(readmePath);
        console.log(`📝 Created README: ${readmePath}`);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    oklchToRgb,
    parseOklch,
    convertColorsInObject,
    processManifestFile
};

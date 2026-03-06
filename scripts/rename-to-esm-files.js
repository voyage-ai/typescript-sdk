#!/usr/bin/env node

const fs = require("fs").promises;
const path = require("path");

const extensionMap = {
    ".js": ".mjs",
    ".d.ts": ".d.mts",
};
const oldExtensions = Object.keys(extensionMap);

async function findFiles(rootPath) {
    const files = [];

    async function scan(directory) {
        const entries = await fs.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
                    await scan(fullPath);
                }
            } else if (entry.isFile()) {
                if (oldExtensions.some((ext) => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        }
    }

    await scan(rootPath);
    return files;
}

async function updateFiles(files) {
    const updatedFiles = [];
    for (const file of files) {
        const updated = await updateFileContents(file);
        updatedFiles.push(updated);
    }

    console.log(`Updated imports in ${updatedFiles.length} files.`);
}

async function resolveBarePath(file, importPath) {
    const dir = path.dirname(file);
    const resolved = path.resolve(dir, importPath);

    // Check if it's a directory with an index file
    try {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
            return `${importPath}/index.mjs`;
        }
    } catch {}

    // Check if a corresponding .js or .mjs file exists
    for (const ext of [".mjs", ".js"]) {
        try {
            await fs.stat(resolved + ext);
            return `${importPath}.mjs`;
        } catch {}
    }

    // If nothing matched, leave it unchanged
    return importPath;
}

async function updateFileContents(file) {
    const content = await fs.readFile(file, "utf8");

    let newContent = content;
    // Update each extension type defined in the map
    for (const [oldExt, newExt] of Object.entries(extensionMap)) {
        // Handle static imports/exports
        const staticRegex = new RegExp(`(import|export)(.+from\\s+['"])(\\.\\.?\\/[^'"]+)(\\${oldExt})(['"])`, "g");
        newContent = newContent.replace(staticRegex, `$1$2$3${newExt}$5`);

        // Handle dynamic imports (yield import, await import, regular import())
        const dynamicRegex = new RegExp(
            `(yield\\s+import|await\\s+import|import)\\s*\\(\\s*['"](\\.\\.\?\\/[^'"]+)(\\${oldExt})['"]\\s*\\)`,
            "g",
        );
        newContent = newContent.replace(dynamicRegex, `$1("$2${newExt}")`);
    }

    // Handle bare imports (no file extension) — these need resolution
    const allExtensions = [...Object.keys(extensionMap), ...Object.values(extensionMap)];
    const bareStaticRegex = /(import|export)(.+from\s+['"])(\.\.?\/[^'"]+)(['"])/g;
    const matches = [...newContent.matchAll(bareStaticRegex)];
    for (const match of matches.reverse()) {
        const importPath = match[3];
        // Skip if it already has a known extension
        if (allExtensions.some((ext) => importPath.endsWith(ext))) continue;

        const resolved = await resolveBarePath(file, importPath);
        if (resolved !== importPath) {
            const start = match.index;
            const end = start + match[0].length;
            newContent = `${newContent.slice(0, start)}${match[1]}${match[2]}${resolved}${match[4]}${newContent.slice(end)}`;
        }
    }

    // Handle bare dynamic imports (no file extension)
    const bareDynamicRegex = /(yield\s+import|await\s+import|import)\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
    const dynMatches = [...newContent.matchAll(bareDynamicRegex)];
    for (const match of dynMatches.reverse()) {
        const importPath = match[2];
        if (allExtensions.some((ext) => importPath.endsWith(ext))) continue;

        const resolved = await resolveBarePath(file, importPath);
        if (resolved !== importPath) {
            const start = match.index;
            const end = start + match[0].length;
            newContent = `${newContent.slice(0, start)}${match[1]}("${resolved}")${newContent.slice(end)}`;
        }
    }

    if (content !== newContent) {
        await fs.writeFile(file, newContent, "utf8");
        return true;
    }
    return false;
}

async function renameFiles(files) {
    let counter = 0;
    for (const file of files) {
        const ext = oldExtensions.find((ext) => file.endsWith(ext));
        const newExt = extensionMap[ext];

        if (newExt) {
            const newPath = file.slice(0, -ext.length) + newExt;
            await fs.rename(file, newPath);
            counter++;
        }
    }

    console.log(`Renamed ${counter} files.`);
}

async function main() {
    try {
        const targetDir = process.argv[2];
        if (!targetDir) {
            console.error("Please provide a target directory");
            process.exit(1);
        }

        const targetPath = path.resolve(targetDir);
        const targetStats = await fs.stat(targetPath);

        if (!targetStats.isDirectory()) {
            console.error("The provided path is not a directory");
            process.exit(1);
        }

        console.log(`Scanning directory: ${targetDir}`);

        const files = await findFiles(targetDir);

        if (files.length === 0) {
            console.log("No matching files found.");
            process.exit(0);
        }

        console.log(`Found ${files.length} files.`);
        await updateFiles(files);
        await renameFiles(files);
        console.log("\nDone!");
    } catch (error) {
        console.error("An error occurred:", error.message);
        process.exit(1);
    }
}

main();

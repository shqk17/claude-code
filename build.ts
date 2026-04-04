import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getMacroDefines } from "./scripts/defines.ts";

const outdir = "dist";

// Step 1: Clean output directory
const { rmSync } = await import("fs");
rmSync(outdir, { recursive: true, force: true });

// Default features that match the official CLI build.
// Additional features can be enabled via FEATURE_<NAME>=1 env vars.
const DEFAULT_BUILD_FEATURES = ["AGENT_TRIGGERS_REMOTE", "CHICAGO_MCP", "VOICE_MODE"];

// Collect FEATURE_* env vars → Bun.build features
const envFeatures = Object.keys(process.env)
    .filter(k => k.startsWith("FEATURE_"))
    .map(k => k.replace("FEATURE_", ""));
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])];

// Step 2: Bundle with splitting
const result = await Bun.build({
    entrypoints: ["src/entrypoints/cli.tsx"],
    outdir,
    target: "bun",
    splitting: true,
    define: getMacroDefines(),
    features,
});

if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

// Step 3: Post-process — replace Bun-only APIs with Node.js compatible versions
const files = await readdir(outdir);
const IMPORT_META_REQUIRE = "var __require = import.meta.require;";
const COMPAT_REQUIRE = `var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);`;

let patched = 0;
for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const filePath = join(outdir, file);
    let content = await readFile(filePath, "utf-8");
    let needsWrite = false;

    // Patch import.meta.require
    if (content.includes(IMPORT_META_REQUIRE)) {
        content = content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE);
        needsWrite = true;
    }

    // Patch globalThis.Bun.$ destructuring
    if (content.includes("var {$ } = globalThis.Bun;")) {
        content = content.replace(
            "var {$ } = globalThis.Bun;",
            `var {$ } = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {
                $: function() { throw new Error("Bun.$ is not available in Node.js"); }
            };`
        );
        needsWrite = true;
    }

    // Patch other Bun.$ destructuring patterns
    if (content.includes("var { $ } = globalThis.Bun;")) {
        content = content.replace(
            "var { $ } = globalThis.Bun;",
            `var { $ } = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {
                $: function() { throw new Error("Bun.$ is not available in Node.js"); }
            };`
        );
        needsWrite = true;
    }

    // Patch direct Bun.spawnSync usage
    if (content.includes("Bun.spawnSync") && !content.includes("var Bun =")) {
        content = `var Bun = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {
            spawnSync: function() { throw new Error("Bun.spawnSync is not available in Node.js"); }
        };\n` + content;
        needsWrite = true;
    }

    if (needsWrite) {
        await writeFile(filePath, content);
        patched++;
    }
}

console.log(
    `Bundled ${result.outputs.length} files to ${outdir}/ (patched ${patched} for Node.js compat)`,
);

// Step 4: Bundle download-ripgrep script as standalone JS for postinstall
const rgScript = await Bun.build({
    entrypoints: ["scripts/download-ripgrep.ts"],
    outdir,
    target: "node",
});
if (!rgScript.success) {
    console.error("Failed to bundle download-ripgrep script:");
    for (const log of rgScript.logs) {
        console.error(log);
    }
    // Non-fatal — postinstall fallback to bun run scripts/download-ripgrep.ts
} else {
    console.log(`Bundled download-ripgrep script to ${outdir}/`);
}

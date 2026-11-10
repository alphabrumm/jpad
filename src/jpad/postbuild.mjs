// Nach dem Build: Startseite, Server-Einstellungen, Aufräumen
import { copyFileSync, writeFileSync, rmSync, readdirSync, existsSync, readFileSync, cpSync } from "fs";

const out = "dist-jpad";
copyFileSync(`${out}/jpad.html`, `${out}/index.html`);

// Lernpfad-Editor PathFinder (Git-Submodul vendor/pathfinder): Kern, Schriften und Symbol nach dist-jpad/pathfinder/
if (existsSync("vendor/pathfinder/core")) {
    for (const d of ["core", "fonts"]) cpSync(`vendor/pathfinder/${d}`, `${out}/pathfinder/${d}`, { recursive: true });
    copyFileSync("vendor/pathfinder/icon.svg", `${out}/pathfinder/icon.svg`);
} else console.warn("Hinweis: vendor/pathfinder fehlt (git submodule update --init) – Lernpfad-Editor wird nicht gebaut.");

// Lernpfad-Editor mit Versionsnummer laden: Auf dem Webspace dürfen .js-Dateien ein Jahr im Zwischenspeicher bleiben,
// und auch GitHub Pages liefert sonst bis zu 10 Minuten lang alte Dateien. Mit ?v=… holt jedes Update frische Dateien.
if (existsSync(`${out}/editor/index.html`) && existsSync(`${out}/pathfinder/core/pathfinder.js`)) {
    const { createHash } = await import("crypto");
    const h = createHash("sha256");
    for (const f of ["pathfinder/core/pathfinder.js", "pathfinder/core/pathfinder.css", "pathfinder/core/pftext.js", "pathfinder/core/pfskin.js", "pathfinder/core/pfexam.js", "editor/jpad-plugin.js", "editor/index.html"])
        if (existsSync(`${out}/${f}`)) h.update(readFileSync(`${out}/${f}`));
    const v = h.digest("hex").slice(0, 10);
    const ei = `${out}/editor/index.html`;
    writeFileSync(ei, readFileSync(ei, "utf8")
        .replace("'../pathfinder/core/pathfinder.js'", `'../pathfinder/core/pathfinder.js?v=${v}'`)
        .replace("'./jpad-plugin.js'", `'./jpad-plugin.js?v=${v}'`)
        .replace('../pathfinder/core/pathfinder.css"', `../pathfinder/core/pathfinder.css?v=${v}"`));
    // JPad öffnet den Editor mit derselben Nummer, damit auch editor/index.html frisch kommt
    let n = 0;
    for (const f of readdirSync(`${out}/assets`).filter(f => f.endsWith(".js"))) {
        const p = `${out}/assets/${f}`, t = readFileSync(p, "utf8");
        if (t.includes("editor/index.html?in=jpad")) { writeFileSync(p, t.split("editor/index.html?in=jpad").join(`editor/index.html?in=jpad&v=${v}`)); n++; }
    }
    console.log(`Lernpfad-Editor Version ${v}` + (n ? "" : " (Hinweis: Aufruf im Bundle nicht gefunden)"));
}

// Für Apache-Webspaces (die meisten einfachen Hoster)
writeFileSync(`${out}/.htaccess`, `# JPad: Einstellungen für Apache-Webserver
AddType application/wasm .wasm
AddType application/manifest+json .webmanifest
AddType text/javascript .js .mjs

# Immer HTTPS (nötig für Offline-Modus und Teilen-Menü auf dem iPad)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# Dateien mit Hash im Namen dürfen lange zwischengespeichert werden
<IfModule mod_headers.c>
  <FilesMatch "\\.(js|css|wasm|woff2?|png|svg|json|txt|mp3)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "(index|jpad)\\.html$|jpad-sw\\.js$|\\.webmanifest$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # Lernpfade und Projekte in learn/ ändern sich (ohne Hash im Namen): immer neu prüfen
  <If "%{REQUEST_URI} =~ m#/learn/#">
    Header set Cache-Control "no-cache"
  </If>
</IfModule>
`);

// JCodes für alle Lernpfade und Projekte in learn/9 … learn/13 (Ersatz für learn/jcode.php ohne PHP, z. B. GitHub Pages)
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const jcodeOf = rel => {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(rel)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    let c = "";
    for (let i = 0; i < 5; i++) { c += ALPHABET[h & 31]; h >>>= 5; }
    return c;
};
const codes = {};
for (let k = 9; k <= 13; k++) {
    const dir = `${out}/learn/${k}`;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) if (/\.(json|html)$/.test(f)) codes[jcodeOf(`${k}/${f}`)] = `${k}/${f}`;
}
writeFileSync(`${out}/learn/jcodes.json`, JSON.stringify(codes, null, 1));

// Übersicht für Lehrkräfte (?lehrkraft): alle Lernpfade und Projekte mit Titel und JCode
const titleOf = file => {
    try {
        const text = readFileSync(file, "utf8");
        if (file.endsWith(".json")) return JSON.parse(text).name || "";
        const m = text.match(/<title>([^<]*)<\/title>/i);
        return m ? m[1].trim() : "";
    } catch (e) { return ""; }
};
const index = [];
for (const dir of readdirSync(`${out}/learn`, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    for (const f of readdirSync(`${out}/learn/${dir}`).sort()) {
        if (!/\.(json|html|zip)$/.test(f)) continue;
        const rel = `${dir}/${f}`;
        index.push({ path: rel, folder: dir, code: /^\d+$/.test(dir) && !f.endsWith(".zip") ? jcodeOf(rel) : null,
            title: f.endsWith(".zip") ? "" : titleOf(`${out}/learn/${rel}`), kind: f.endsWith(".json") ? "Projekt" : f.endsWith(".zip") ? "ZIP" : "Lernpfad" });
    }
}
writeFileSync(`${out}/learn/index.json`, JSON.stringify(index, null, 1));
console.log("JCodes:", Object.entries(codes).map(([c, f]) => `${c} ${f}`).join(", "));

for (const f of ["maintenance", "includeIDE.js"]) rmSync(`${out}/${f}`, { recursive: true, force: true });
console.log("JPad: dist-jpad ist fertig zum Hochladen.");

import * as PIXI from 'pixi.js';
import * as monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// CSS der Online-IDE (Ausgabe, Grafik, Eingabezeilen)
import "/assets/fonts/fonts.css";
import "/assets/css/editor.css";
import "/assets/css/embedded.css";
import "/assets/css/helper.css";
import "/assets/css/icons.css";
import "/assets/css/run.css";
import "/assets/css/debugger.css";

// Schriften lokal ausliefern (keine Verbindung zu Google & Co., datenschutzfreundlich)
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

import "./jpad.css";

import spritesheetjson from '/assets/graphics/spritesheet.json.txt';
import spritesheetpng from '/assets/graphics/spritesheet.png';
import { PixiSpritesheetData } from "../client/spritemanager/PixiSpritesheetData.js";
import { App } from "./App.js";

declare global {
    interface Window { MonacoEnvironment?: monaco.Environment | undefined; }
}

declare var APP_VERSION: string;

function loadSpritesheet() {
    fetch(spritesheetjson)
        .then((response) => response.json())
        .then((spritesheetData: PixiSpritesheetData) => {
            PIXI.Assets.load(spritesheetpng).then((texture: PIXI.Texture) => {
                const source: PIXI.ImageSource = texture.source;
                source.minFilter = "nearest";
                source.magFilter = "nearest";
                spritesheetData.meta.size.w = texture.width;
                spritesheetData.meta.size.h = texture.height;
                const spritesheet = new PIXI.Spritesheet(texture, spritesheetData);
                spritesheet.parse().then(() => {
                    PIXI.Assets.cache.set('spritesheet', spritesheet);
                });
            });
        });
}

// Monaco braucht nur noch den Basis-Worker (Java wird von der Online-IDE selbst verarbeitet)
self.MonacoEnvironment = {
    getWorker: () => new editorWorker()
};

/**
 * Prüfungsfassung (Build mit VITE_JPAD_PRUEFUNG=1, liegt in Probe unter /jpad/): läuft nur als Programmier-Aufgabe
 * in einer Probe-Prüfung – also mit ?pfapp, in einem Rahmen, und nur, wenn die Seite drumherum von derselben Domain
 * stammt. Direkt im Browser aufgerufen startet sie nicht: Schüler sollen sie während der Prüfung nicht als
 * eigene Programmierumgebung (oder für mitgebrachte Projekte) nutzen können.
 */
const PRUEFUNG = import.meta.env.VITE_JPAD_PRUEFUNG === "1";
function pruefungErlaubt(): boolean {
    if (!new URLSearchParams(location.search).has("pfapp") || window.self === window.top) return false;
    try { return window.parent.location.origin === location.origin; } catch (e) { return false; }
}

async function boot() {
    const root = document.getElementById("jpad-app")!;
    if (PRUEFUNG && !pruefungErlaubt()) {
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="jp-fatal"><h1>JPad – Prüfungsfassung</h1>
            <p>Diese Fassung von JPad öffnet sich nur innerhalb einer Prüfung in Probe – über die Programmier-Aufgabe der Prüfung.</p></div>`;
        return;
    }
    // Notbremse: JPad wurde in einem abgeschotteten Lernpfad-Rahmen geladen (z. B. über einen Link im Lernpfad)
    if (window.self !== window.top && location.origin == "null") {
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="jp-fatal"><h1>Dieser Link führt nicht weiter</h1>
            <p>Der Link im Lernpfad hat versucht, eine andere Seite zu öffnen. Tippe oben noch einmal auf einen anderen Reiter und dann wieder auf den Lernpfad.</p></div>`;
        return;
    }
    loadSpritesheet();
    try {
        await new App(root).start();
    } catch (e: any) {
        console.error(e);
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="jp-fatal"><h1>JPad konnte nicht starten</h1>
            <p>Lade die Seite neu. Wenn das nicht hilft, nutze einen aktuellen Browser (Safari ab iOS 16, Chrome, Edge, Firefox).</p>
            <pre>${String(e?.message || e).replace(/</g, "&lt;")}</pre></div>`;
    }
    console.log("JPad auf Basis der Online-IDE " + APP_VERSION);
}

if (document.readyState == "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

// Offline-Fähigkeit (nur im fertigen Build, nicht im Entwicklungsserver)
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./jpad-sw.js").catch(e => console.warn("Service Worker:", e));
    });
}

/* Installs the delivered brand artwork into the Xcode asset catalog.

   Sources live in TherapyTracker-web/icon-ideas/groundwork/ and are deliberately NOT used
   by the web app — 2.4MB of PNG cannot be precached for offline and cannot follow the
   theme, which is why the PWA draws an inline-SVG launch screen instead. Same mark, two
   renderings; see CLAUDE.md § Launch screen.

   Idempotent, and re-run by `npm run sync` so a regenerated ios/ never loses the branding. */
import { copyFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const SRC = resolve("TherapyTracker-web/icon-ideas/groundwork");
const CAT = resolve("ios/App/App/Assets.xcassets");

/* --- App icon: one 1024 master, which is all Xcode has wanted since the single-size
       app icon landed. No embedded text, per Apple's icon guidelines. --- */
await copyFile(`${SRC}/icon-1024.png`, `${CAT}/AppIcon.appiconset/AppIcon-512@2x.png`);

/* --- Launch screen: light and dark, so the native splash matches the theme the web app
       is about to render in. Without the dark variant a dark-mode user gets a white flash
       before the WebView paints. --- */
const SPLASH = `${CAT}/Splash.imageset`;

// Capacitor's template ships three same-sized placeholders; replace them by name so the
// storyboard's `image="Splash"` reference keeps resolving.
for (const [n, tone] of [["", "light"], ["-1", "light"], ["-2", "light"]]) {
  await copyFile(`${SRC}/splash-universal-${tone}.png`, `${SPLASH}/splash-2732x2732${n}.png`);
}
for (const n of ["", "-1", "-2"]) {
  await copyFile(`${SRC}/splash-universal-dark.png`, `${SPLASH}/splash-dark-2732x2732${n}.png`);
}

await writeFile(
  `${SPLASH}/Contents.json`,
  JSON.stringify(
    {
      images: [
        { idiom: "universal", filename: "splash-2732x2732-2.png", scale: "1x" },
        { idiom: "universal", filename: "splash-2732x2732-1.png", scale: "2x" },
        { idiom: "universal", filename: "splash-2732x2732.png", scale: "3x" },
        { idiom: "universal", appearances: [{ appearance: "luminosity", value: "dark" }],
          filename: "splash-dark-2732x2732-2.png", scale: "1x" },
        { idiom: "universal", appearances: [{ appearance: "luminosity", value: "dark" }],
          filename: "splash-dark-2732x2732-1.png", scale: "2x" },
        { idiom: "universal", appearances: [{ appearance: "luminosity", value: "dark" }],
          filename: "splash-dark-2732x2732.png", scale: "3x" }
      ],
      info: { version: 1, author: "xcode" }
    },
    null,
    2
  ) + "\n"
);

console.log("  installed app icon + light/dark launch screen");

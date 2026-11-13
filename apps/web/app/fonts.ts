/** Self-hosted fonts (SIL OFL 1.1, files in app/fonts, licenses alongside). next/font/local
 *  works offline, so a fresh clone builds without network access. Exposed as CSS variables
 *  consumed by styles/tokens.css: --font-display, --font-mono, --font-body. */
import localFont from "next/font/local";

export const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/chakra-petch-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/chakra-petch-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/chakra-petch-latin-700-normal.woff2", weight: "700" },
  ],
  fallback: ["Rajdhani", "Saira Semi Condensed", "system-ui", "sans-serif"],
});

export const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/jetbrains-mono-latin-700-normal.woff2", weight: "700" },
  ],
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const body = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-condensed-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-sans-condensed-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-sans-condensed-latin-600-normal.woff2", weight: "600" },
  ],
  fallback: ["Arial Narrow", "system-ui", "sans-serif"],
});

export const fontVars = `${display.variable} ${mono.variable} ${body.variable}`;

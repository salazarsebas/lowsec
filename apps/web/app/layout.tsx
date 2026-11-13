import "../styles/tokens.css";
import "../styles/ui.css";
import "./globals.css";
import { fontVars } from "./fonts";
export const metadata = { title: "Lowsec — haul, raid, survive", description: "A mini EVE Frontier on NEAR with an AI Economic Council" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}

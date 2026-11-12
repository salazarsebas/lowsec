import "./globals.css";
export const metadata = { title: "Lowsec — haul, raid, survive", description: "A mini EVE Frontier on NEAR with an AI Economic Council" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

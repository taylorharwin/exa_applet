import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exa Event Finder",
  description:
    "Find upcoming book fairs, comic cons, and related conventions in your US state.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

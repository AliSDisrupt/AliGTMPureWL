import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PureWL GTM",
  description: "PureWL GTM dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Headless WordPress test frontend",
  description:
    "Decoupled front end reading from WPGraphQL. Built as a rig for testing site-management tooling against headless setups.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}

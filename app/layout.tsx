import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strava Challenge",
  description: "Track your weekly long run challenge with Strava",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}


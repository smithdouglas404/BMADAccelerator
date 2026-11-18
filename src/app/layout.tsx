import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import "../studio/styles.css";
import "../studio/studio-extras.css";
import "../studio/readability.css";
import "../studio/paper.css";
import { ViewControls } from "../studio/ViewControls";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "From an unfinished idea to a validated use case, a living spec and a production-minded pilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="clean" suppressHydrationWarning>
      {/* Inter is the clean theme's font (shadcn Modern Minimal); DM Sans, DM Mono and Fraunces load from styles.css. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router root layout: loads on every page */}
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" /></head>
      <body>{children}<ViewControls /></body>
    </html>
  );
}

import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import "./ui.css";
import "../studio/styles.css";
import "../studio/studio-extras.css";
import "../studio/readability.css";
import "../studio/paper.css";
import { ViewControls } from "../studio/ViewControls";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "From an unfinished idea to a validated use case, a living spec and a production-minded pilot.",
};

// Theme script: apply the remembered theme before the first paint, so a dark-theme user never sees a white flash.
const THEME_BOOT = `try{var t=localStorage.getItem('studio-theme');if(t==='paper'||t==='dark'||t==='clean')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="clean" suppressHydrationWarning>
      {/* shadcn Modern Minimal fonts: Inter (text), Source Serif 4 (the headline accent), JetBrains Mono (labels). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router root layout: loads on every page */}
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,500;0,600;1,500&display=swap" /><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body>{children}<ViewControls /></body>
    </html>
  );
}

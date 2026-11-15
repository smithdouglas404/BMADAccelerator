import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "BMAD Accelerator",
  description: "From a spoken use case to a production-ready pilot, powered by the BMAD Method.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <TooltipProvider delayDuration={300}>
          <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
            <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
              <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
                <span
                  className="grid size-7 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground shadow-sm"
                  aria-hidden
                >
                  BA
                </span>
                BMAD Accelerator
              </Link>
              <NavLinks />
            </div>
          </header>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}

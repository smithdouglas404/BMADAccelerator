import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BMAD Accelerator",
  description: "From a spoken use case to a production-ready pilot, powered by the BMAD Method.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="sticky top-0 z-30 border-b border-line glass">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-6 w-6 rounded-lg bg-gradient-to-br from-accent to-accent2" aria-hidden />
              BMAD Accelerator
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-ink">
                Use cases
              </Link>
              <Link href="/settings" className="hover:text-ink">
                Settings
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

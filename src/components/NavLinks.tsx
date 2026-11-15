"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Use cases", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Top navigation with the current page highlighted.
export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const on = href === "/" ? path === "/" || path.startsWith("/use-cases") : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              on && "bg-secondary text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

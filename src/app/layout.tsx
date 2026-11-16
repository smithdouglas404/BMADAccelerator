import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import "../studio/styles.css";
import "../studio/studio-extras.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "From an unfinished idea to a validated use case, a living spec and a production-minded pilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

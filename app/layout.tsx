import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import { DemoBanner } from "./_components/demo-banner";
import { HeaderBar, SiteHeader } from "./_components/site-header";
import "./globals.css";

// next/font downloads the font at build time and serves it from our own domain,
// so students' browsers never contact Google.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "LenguaLearn",
  description: "Learn Spanish vocabulary in short daily sessions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint. Inline, so nothing loads from elsewhere. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("lengualearn.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <DemoBanner />
        <Suspense fallback={<HeaderBar />}>
          <SiteHeader />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

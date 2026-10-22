import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import { DemoBanner } from "./_components/demo-banner";
import { HeaderBar, HideOnBare, SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";
import { isDemoSite } from "@/lib/demo/config";
import { demoUrl } from "@/lib/site/config";
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
  // The real site points visitors at the demo; the demo site offers sign-in instead.
  const demoHref = isDemoSite(process.env) ? null : demoUrl(process.env);
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
        <Suspense fallback={<HeaderBar demoHref={demoHref} />}>
          <SiteHeader demoHref={demoHref} />
        </Suspense>
        {children}
        <Suspense fallback={<SiteFooter />}>
          <HideOnBare>
            <SiteFooter />
          </HideOnBare>
        </Suspense>
      </body>
    </html>
  );
}

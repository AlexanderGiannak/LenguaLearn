import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// next/font downloads the font at build time and serves it from our own domain,
// so students' browsers never contact Google.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "LenguaLearn",
  description: "Learn Spanish vocabulary in short daily sessions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint. Inline, so nothing loads from elsewhere. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("lengualearn.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

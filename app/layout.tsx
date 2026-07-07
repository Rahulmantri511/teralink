import type { Metadata } from "next";
import "./globals.css";
import GoogleAnalytics from "./GoogleAnalytics";
import Script from "next/script";

export const metadata: Metadata = {
  metadataBase: new URL("https://teralink.in"),
  title: {
    default: "TeraLink — Free TeraBox Video Player & Downloader Online",
    template: "%s | TeraLink",
  },
  description:
    "TeraLink is the best free online TeraBox Video Player and Downloader. Stream TeraBox videos in HD or get direct download links — no app, no login. Works on Android, iOS & PC. Supports terabox.com, terasharefile.com, 1024tera.com.",
  applicationName: "TeraLink",
  keywords: [
    "TeraBox Player",
    "TeraBox Video Player Online",
    "TeraBox Link Opener",
    "TeraBox Downloader",
    "TeraBox Link Player",
    "Play TeraBox Video Online",
    "TeraBox Link Downloader",
    "Free TeraBox Bypasser",
    "Watch TeraBox without app",
    "TeraBox direct download",
    "1024tera player",
    "terasharefile player",
    "terabox online player",
    "terabox stream online free",
    "terabox video downloader online",
    "open terabox link online",
    "terabox link opener free",
    "terabox player no login",
    "terabox without app",
    "terabox hd player",
  ],
  authors: [{ name: "TeraLink" }],
  creator: "TeraLink",
  publisher: "TeraLink",
  openGraph: {
    title: "TeraLink — Free TeraBox Video Player & Downloader Online",
    description:
      "Stream TeraBox videos online in HD or download at high speed — no app, no login. Works on Android, iOS, and PC.",
    type: "website",
    siteName: "TeraLink",
    locale: "en_US",
    url: "https://teralink.in",
  },
  twitter: {
    card: "summary_large_image",
    title: "TeraLink — Free TeraBox Video Player & Downloader Online",
    description:
      "Stream TeraBox videos online in HD or download at high speed — no app, no login.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://teralink.in",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Google AdSense Script */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4863036831697942"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}


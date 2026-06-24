import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://teralink.vercel.app"),
  title: {
    default: "TeraLink — Free TeraBox Video Player & Downloader Online",
    template: "%s | TeraLink",
  },
  description:
    "Stream TeraBox videos online or generate high-speed direct download links — no app needed, no login, no ads. Supports terabox.com, terasharefile.com, 1024tera.com. Free HD player for Android, iOS & PC.",
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
    "terabox stream",
  ],
  openGraph: {
    title: "TeraLink — Free TeraBox Video Player & Downloader Online",
    description:
      "Stream TeraBox videos online or download at high speed — no app, no login. Works on Android, iOS, and PC.",
    type: "website",
    siteName: "TeraLink",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "TeraLink — Free TeraBox Video Player & Downloader Online",
    description:
      "Stream TeraBox videos online or download at high speed — no app, no login. Works on Android, iOS, and PC.",
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
    canonical: "/",
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
      </head>
      <body>{children}</body>
    </html>
  );
}

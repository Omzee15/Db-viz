import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dbviz.buildc3.tech"),
  title: "Db-Viz — Database Schema Visualizer & DBML Editor",
  description:
    "Db-Viz is a database schema visualizer and DBML editor. Design, edit and visualize your database schema as an interactive diagram.",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Db-Viz",
    title: "Db-Viz — Database Schema Visualizer & DBML Editor",
    description:
      "Db-Viz is a database schema visualizer and DBML editor. Design, edit and visualize your database schema as an interactive diagram.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Db-Viz — Database Schema Visualizer & DBML Editor",
    description:
      "Db-Viz is a database schema visualizer and DBML editor. Design, edit and visualize your database schema as an interactive diagram.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Db-Viz",
  url: "https://dbviz.buildc3.tech/",
  description:
    "Db-Viz is a database schema visualizer and DBML editor. Design, edit and visualize your database schema as an interactive diagram.",
  publisher: { "@type": "Organization", name: "BuildC3", url: "https://buildc3.tech/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

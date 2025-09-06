import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { DeviceProvider } from "@/contexts/DeviceContext";
import DeviceAwareLayout from "@/components/DeviceAwareLayout";

export const metadata: Metadata = {
  title: "Tatakai - Modern Anime Streaming",
  description: "Watch the latest anime episodes and discover new series with high-quality streaming. Your ultimate anime destination.",
  keywords: "anime, streaming, watch anime, latest episodes, anime series, manga",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased font-sans">
        <DeviceProvider>
          <DeviceAwareLayout>
            <div className="min-h-screen bg-background text-foreground">
              <Navigation />
              <main className="device-nav" style={{ paddingTop: 'var(--device-nav-height)' }}>
                {children}
              </main>
              <Footer />
            </div>
          </DeviceAwareLayout>
        </DeviceProvider>
      </body>
    </html>
  );
}

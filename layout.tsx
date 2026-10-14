import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/ui';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = { title: 'Aplikasi Sparepart', description: 'Analisa permintaan sparepart', robots: { index: false, follow: false }, appleWebApp: { capable: true, title: 'Sparepart', statusBarStyle: 'default' }, icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#e00000' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Poppins:wght@500;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body><Providers>{children}</Providers><RegisterSW /></body>
    </html>
  );
}

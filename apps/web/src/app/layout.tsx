import type { Metadata, Viewport } from 'next';
import { PwaPrompt } from '@/components/PwaPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'DAH — ОСМД у смартфоні',
  description: 'Управління ОСМД: фінанси, внески, прозорість для мешканців',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DAH',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <PwaPrompt />
      </body>
    </html>
  );
}
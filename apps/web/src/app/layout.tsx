import type { Metadata, Viewport } from 'next';
import { AuthCookieSync } from '@/components/AuthCookieSync';
import { PwaPrompt } from '@/components/PwaPrompt';
import { QueryProvider } from '@/components/QueryProvider';
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
    <html lang="uk" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dah_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <QueryProvider>
          <AuthCookieSync />
          {children}
          <PwaPrompt />
        </QueryProvider>
      </body>
    </html>
  );
}
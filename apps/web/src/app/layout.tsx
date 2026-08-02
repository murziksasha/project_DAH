import type { Metadata, Viewport } from 'next';
import { AuthCookieSync } from '@/components/AuthCookieSync';
import { LocaleProvider } from '@/components/LocaleProvider';
import { PwaPrompt } from '@/components/PwaPrompt';
import { QueryProvider } from '@/components/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Мій дім — ОСББ та УК у смартфоні',
  description: 'Управління ОСББ і управляючими компаніями: фінанси, внески, прозорість для мешканців',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Мій дім',
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
          <LocaleProvider>
            <AuthCookieSync />
            {children}
            <PwaPrompt />
          </LocaleProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
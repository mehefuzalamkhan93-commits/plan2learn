import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Smart Learning Planner - AI-Driven Study Platform',
  description: 'Adaptive study planning with AI-powered scheduling, spaced repetition, and exam readiness prediction',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Resize the layout viewport when the mobile keyboard opens so pinned
  // composers stay visible above the keyboard.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preload" as="image" href="/chat-wallpaper-dark.png" />
        <link rel="preload" as="image" href="/sources-panel-dark.png" />
        <link rel="preload" as="image" href="/studio-panel-dark.png" />
        <link rel="preload" as="image" href="/chat-wallpaper-light.png" />
        <link rel="preload" as="image" href="/sources-panel-light.png" />
        <link rel="preload" as="image" href="/studio-panel-light.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                function isExtensionError(event) {
                  var message = (event.message || (event.reason && (event.reason.message || event.reason))) || '';
                  var filename = event.filename || '';
                  var stack = (event.error && event.error.stack) || (event.reason && (event.reason.stack)) || '';
                  var str = (String(message) + ' ' + String(filename) + ' ' + String(stack)).toLowerCase();
                  return (
                    str.indexOf('chrome-extension://') !== -1 ||
                    str.indexOf('moz-extension://') !== -1 ||
                    str.indexOf('chrome: call method') !== -1 ||
                    str.indexOf('resizeobserver loop') !== -1
                  );
                }
                window.addEventListener('error', function(e) {
                  if (isExtensionError(e)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  if (isExtensionError(e)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
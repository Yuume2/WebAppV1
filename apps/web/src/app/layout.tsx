import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/styles/globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost } from '@/components/ToastHost';
import { SessionProvider } from '@/features/auth/SessionContext';

export const metadata: Metadata = {
  title: 'AI Workspace V1',
  description: 'Unified workspace for multiple AI providers and chat contexts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ToastHost>
            <Suspense fallback={null}>
              <SessionProvider>{children}</SessionProvider>
            </Suspense>
          </ToastHost>
        </ErrorBoundary>
      </body>
    </html>
  );
}

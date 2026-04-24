import type { Metadata } from 'next';
import '@/styles/globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost } from '@/components/ToastHost';

export const metadata: Metadata = {
  title: 'AI Workspace V1',
  description: 'Unified workspace for multiple AI providers and chat contexts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ToastHost>{children}</ToastHost>
        </ErrorBoundary>
      </body>
    </html>
  );
}

import type { ReactNode } from 'react';
import { Navbar } from '../partials/Navbar';
import { pageGeneratedAt } from '@/core/app-info';

interface LayoutProps {
  title?: string;
  fullName?: string | null;
  isAdmin?: boolean;
  children: ReactNode;
}

export function Layout({ title, fullName, isAdmin, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ?? 'RPL GPU Platform'}</title>
        <link rel="icon" href="data:," />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <div className="layout-container">
          <Navbar fullName={fullName} isAdmin={isAdmin} />
          <main>{children}</main>
          <footer>
            <span>{process.env.APP_VERSION ?? 'dev'} of gpu-platform</span>
            <span>Page generated {pageGeneratedAt()}</span>
          </footer>
        </div>
      </body>
    </html>
  );
}

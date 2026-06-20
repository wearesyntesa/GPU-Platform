import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface InternalErrorPageProps {
  stack?: string | null;
}

export function InternalErrorPage({ stack }: InternalErrorPageProps) {
  return (
    <Layout title="Internal Server Error - RPL GPU Platform">
      <h1>Internal Server Error</h1>
      <p>Something went wrong. The error has been logged.</p>
      {stack && (
        <details>
          <summary>Debug info</summary>
          <pre>{stack}</pre>
        </details>
      )}
      <p>
        <a href="/" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back home
        </a>
      </p>
    </Layout>
  );
}

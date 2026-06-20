import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

export function NotFoundPage() {
  return (
    <Layout title="Page Not Found - RPL GPU Platform">
      <h1>Page Not Found</h1>
      <p>The page you requested does not exist.</p>
      <p>
        <a href="/" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back home
        </a>
      </p>
    </Layout>
  );
}

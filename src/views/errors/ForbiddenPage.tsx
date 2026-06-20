import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

export function ForbiddenPage() {
  return (
    <Layout title="Forbidden - RPL GPU Platform">
      <h1>Forbidden</h1>
      <p>Your account is not allowed to access this page.</p>
      <p>
        <a href="/" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back home
        </a>
      </p>
    </Layout>
  );
}

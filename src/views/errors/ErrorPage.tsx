import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface ErrorPageProps {
  statusCode: number;
  message: string;
}

export function ErrorPage({ statusCode, message }: ErrorPageProps) {
  return (
    <Layout title="Error - RPL GPU Platform">
      <h1>Error {statusCode}</h1>
      <p>{message || 'An unexpected error occurred.'}</p>
      <p>
        <a href="/" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back home
        </a>
      </p>
    </Layout>
  );
}

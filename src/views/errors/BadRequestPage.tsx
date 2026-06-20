import { Layout } from '@/views/layouts/Layout';

interface BadRequestPageProps {
  messages: string[];
}

export function BadRequestPage({ messages }: BadRequestPageProps) {
  return (
    <Layout title="Invalid Input - RPL GPU Platform">
      <h1>Invalid Input</h1>
      {messages && messages.length > 0 ? (
        <ul>
          {messages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : (
        <p>The submitted data was invalid.</p>
      )}
      <p>
        <a href="javascript:history.back()">Go back</a>
      </p>
    </Layout>
  );
}

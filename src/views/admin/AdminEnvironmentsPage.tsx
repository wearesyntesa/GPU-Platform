import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface EnvironmentItem {
  id: string;
  name: string;
  imageRef: string;
  packageManifest: string | null;
  enabled: boolean;
}

interface AdminEnvironmentsPageProps {
  fullName: string;
  isAdmin: boolean;
  environments: EnvironmentItem[];
}

export function AdminEnvironmentsPage({
  fullName,
  isAdmin,
  environments,
}: AdminEnvironmentsPageProps) {
  return (
    <Layout title="Environments - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <div className="page-actions">
        <h1>Environments</h1>
        <a href="/admin/environments/new" className="btn btn-primary">
          Add environment
        </a>
      </div>

      {environments.length === 0 ? (
        <p>No environments.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Starting image</th>
                <th>Packages</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env) => (
                <tr key={env.id}>
                  <td>{env.name}</td>
                  <td>{env.imageRef}</td>
                  <td>{env.packageManifest ? 'custom list' : 'none'}</td>
                  <td>{env.enabled ? 'yes' : 'no'}</td>
                  <td>
                    <div className="button-group-center">
                      <a href={`/admin/environments/${env.id}/edit`} className="btn btn-ghost">
                        Edit
                      </a>
                      <form method="post" action={`/admin/environments/${env.id}/toggle`}>
                        <button type="submit" className="btn btn-ghost">
                          {env.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p>
        <a href="/admin" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to admin
        </a>
      </p>
    </Layout>
  );
}

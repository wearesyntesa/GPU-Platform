import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';
import { Pagination } from '@/views/partials/Pagination';

interface GrantItem {
  grant: {
    id: string;
    createdAt: Date | string;
    gpuTarget: string;
    requestedCpu: number;
    requestedMemoryGb: number;
  };
  user: { username: string };
  environment: { name: string };
  activeWorkspace: { id: string; status: string } | null;
}

interface AdminGrantsPageProps {
  username: string;
  isAdmin: boolean;
  grants: {
    items: GrantItem[];
    page: number;
    pageCount: number;
    total: number;
  };
}

export function AdminGrantsPage({ username, isAdmin, grants }: AdminGrantsPageProps) {
  return (
    <Layout title="Approved Grants - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>Approved access grants</h1>

      {grants.items.length === 0 ? (
        <p>No approved grants.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Requester</th>
                  <th>Environment</th>
                  <th>GPU</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Workspace</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {grants.items.map((item) => (
                  <tr key={item.grant.id}>
                    <td>{String(item.grant.createdAt)}</td>
                    <td>{item.user.username}</td>
                    <td>{item.environment.name}</td>
                    <td>{item.grant.gpuTarget}</td>
                    <td>{item.grant.requestedCpu}</td>
                    <td>{item.grant.requestedMemoryGb} GB</td>
                    <td>
                      {item.activeWorkspace && item.activeWorkspace.id
                        ? `${item.activeWorkspace.status} \u00b7 ${item.activeWorkspace.id}`
                        : 'none'}
                    </td>
                    <td>
                      {item.activeWorkspace && item.activeWorkspace.id ? (
                        'Stop session first'
                      ) : (
                        <form method="post" action={`/admin/grants/${item.grant.id}/revoke`}>
                          <button type="submit">Revoke</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={grants.page}
            pageCount={grants.pageCount}
            total={grants.total}
            label="approved"
            base="/admin/grants"
          />
        </>
      )}

      <p className="back-action">
        <a href="/admin" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to admin
        </a>
      </p>
    </Layout>
  );
}

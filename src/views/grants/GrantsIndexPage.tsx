import { Layout } from '@/views/layouts/Layout';
import { Pagination } from '@/views/partials/Pagination';
import { Plus, RefreshCw } from 'lucide-react';

interface GrantItem {
  createdAt: Date | string;
  gpuTarget: string;
  requestedCpu: number;
  requestedMemoryGb: number;
  purpose: string | null;
  status: string;
  decisionReason: string | null;
  id: string;
}

interface GrantsIndexPageProps {
  fullName: string;
  isAdmin: boolean;
  grants: {
    items: GrantItem[];
    page: number;
    pageCount: number;
    total: number;
  };
  liveAccess: GrantItem | null;
  hasLiveWorkspace: boolean;
  message: string | null;
}

export function GrantsIndexPage({
  fullName,
  isAdmin,
  grants,
  liveAccess,
  hasLiveWorkspace,
  message,
}: GrantsIndexPageProps) {
  const canRequestChange = liveAccess?.status === 'approved' && !hasLiveWorkspace;
  const hasPendingRequest = liveAccess?.status === 'pending';

  return (
    <Layout title="My Access Grants - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <div className="page-actions">
        <h1>My Access Grants</h1>
        {canRequestChange && (
          <a href="/grants/new" className="btn btn-primary">
            <RefreshCw size={15} />
            Request change
          </a>
        )}
        {!liveAccess && (
          <a href="/grants/new" className="btn btn-primary">
            <Plus size={15} />
            New access request
          </a>
        )}
      </div>
      {liveAccess?.status === 'approved' && hasLiveWorkspace && (
        <div className="notice notice-warning">
          <strong>Workspace is running</strong>
          Stop your active workspace before requesting access changes.
        </div>
      )}
      {hasPendingRequest && (
        <div className="notice">
          <strong>Access request pending</strong>
          Wait for admin review, or cancel your pending request before submitting a different one.
        </div>
      )}
      {message && (
        <p>
          <strong>{message}</strong>
        </p>
      )}
      {grants.items.length === 0 ? (
        <p>No access requests yet.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>GPU target</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Decision reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {grants.items.map((grant) => (
                  <tr key={grant.id}>
                    <td>{String(grant.createdAt)}</td>
                    <td>{grant.gpuTarget}</td>
                    <td>{grant.requestedCpu}</td>
                    <td>{grant.requestedMemoryGb} GB</td>
                    <td>{grant.purpose ?? ''}</td>
                    <td>{grant.status}</td>
                    <td>{grant.decisionReason ?? ''}</td>
                    <td>
                      {grant.status === 'approved' &&
                        grant.id === liveAccess?.id &&
                        hasLiveWorkspace &&
                        'Session running'}
                      {grant.status === 'approved' &&
                        !(grant.id === liveAccess?.id && hasLiveWorkspace) && (
                          <form method="post" action={`/workspaces/start/${grant.id}`}>
                            <button type="submit">Start session</button>
                          </form>
                        )}
                      {grant.status === 'pending' && (
                        <form method="post" action={`/grants/${grant.id}/cancel`}>
                          <button type="submit">Cancel</button>
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
            label="grants"
            base="/grants"
          />
        </>
      )}
    </Layout>
  );
}

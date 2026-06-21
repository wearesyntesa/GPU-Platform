import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface GrantDetails {
  grant: {
    id: string;
    status: string;
    gpuTarget: string;
    requestedCpu: number;
    requestedMemoryGb: number;
    purpose: string | null;
    decisionReason: string | null;
    runtimeImageId: string;
  };
  user: { fullName: string };
  environment: { id: string; name: string };
}

interface Environment {
  id: string;
  name: string;
}

interface AdminGrantDetailPageProps {
  fullName: string;
  isAdmin: boolean;
  grantDetails: GrantDetails | null;
  environments: Environment[];
  gpuTargets: string[];
  settings: {
    maxRequestCpu: number;
    maxRequestMemoryGb: number;
  };
  capacityWarning: string | null;
}

export function AdminGrantDetailPage({
  fullName,
  isAdmin,
  grantDetails,
  environments,
  gpuTargets,
  settings,
  capacityWarning,
}: AdminGrantDetailPageProps) {
  return (
    <Layout title="Review Access Request - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      {!grantDetails ? (
        <h1>Access request not found</h1>
      ) : (
        <>
          <h1>Review access request</h1>
          <table className="table detail-table">
            <tbody>
              <tr>
                <th>Requester</th>
                <td>{grantDetails.user.fullName}</td>
              </tr>
              <tr>
                <th>Environment</th>
                <td>{grantDetails.environment.name}</td>
              </tr>
              <tr>
                <th>GPU target</th>
                <td>{grantDetails.grant.gpuTarget}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>{grantDetails.grant.status}</td>
              </tr>
              <tr>
                <th>CPU</th>
                <td>{grantDetails.grant.requestedCpu}</td>
              </tr>
              <tr>
                <th>Memory</th>
                <td>{grantDetails.grant.requestedMemoryGb} GB</td>
              </tr>
              <tr>
                <th>Purpose</th>
                <td>{grantDetails.grant.purpose ?? '—'}</td>
              </tr>
              <tr>
                <th>Decision reason</th>
                <td>{grantDetails.grant.decisionReason ?? '—'}</td>
              </tr>
            </tbody>
          </table>

          {grantDetails.grant.status === 'pending' && (
            <>
              <hr />
              <form
                className="plain-form"
                method="post"
                action={`/admin/grants/${grantDetails.grant.id}/approve`}
              >
                <h2>Approve</h2>
                <p>Adjust environment, GPU target, CPU, or memory before approving this request.</p>
                {capacityWarning && (
                  <div className="notice notice-warning">
                    <strong>Capacity warning</strong>
                    {capacityWarning}
                  </div>
                )}
                <label>
                  Environment
                  <select name="runtimeImageId" required>
                    {environments.map((env) => (
                      <option
                        key={env.id}
                        value={env.id}
                        selected={env.id === grantDetails.grant.runtimeImageId}
                      >
                        {env.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  GPU target
                  <select name="gpuTarget" required>
                    <option
                      value="auto"
                      selected={
                        grantDetails.grant.gpuTarget === 'auto' ||
                        grantDetails.grant.gpuTarget === 'any'
                      }
                    >
                      any available GPU
                    </option>
                    {gpuTargets.map((target) => (
                      <option
                        key={target}
                        value={target}
                        selected={target === grantDetails.grant.gpuTarget}
                      >
                        {target}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  CPU
                  <input
                    name="requestedCpu"
                    type="number"
                    min="1"
                    max={settings.maxRequestCpu}
                    defaultValue={grantDetails.grant.requestedCpu}
                    required
                  />
                  <small>Maximum {settings.maxRequestCpu} cores per request.</small>
                </label>
                <label>
                  Memory GB
                  <input
                    name="requestedMemoryGb"
                    type="number"
                    min="1"
                    max={settings.maxRequestMemoryGb}
                    defaultValue={grantDetails.grant.requestedMemoryGb}
                    required
                  />
                  <small>Maximum {settings.maxRequestMemoryGb} GB per request.</small>
                </label>
                <label>Note</label>
                <input name="reason" maxLength={500} />
                <button type="submit" className="btn btn-primary">
                  Approve
                </button>
              </form>

              <hr />
              <form
                className="plain-form"
                method="post"
                action={`/admin/grants/${grantDetails.grant.id}/reject`}
              >
                <h2>Reject</h2>
                <label>
                  Reason
                  <input name="reason" maxLength={500} required />
                </label>
                <button type="submit" className="btn btn-danger">
                  Reject
                </button>
              </form>
            </>
          )}
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

import { Layout } from '@/views/layouts/Layout';

interface Environment {
  id: string;
  name: string;
}

interface NewGrantPageProps {
  username: string;
  isAdmin: boolean;
  environments: Environment[];
  gpuTargets: string[];
  settings: {
    maxRequestCpu: number;
    maxRequestMemoryGb: number;
  };
  isChangeRequest: boolean;
  hasLiveWorkspace: boolean;
  hasPendingRequest: boolean;
}

export function NewGrantPage({
  username,
  isAdmin,
  environments,
  gpuTargets,
  settings,
  isChangeRequest,
  hasLiveWorkspace,
  hasPendingRequest,
}: NewGrantPageProps) {
  return (
    <Layout title="Request Access - RPL GPU Platform" username={username} isAdmin={isAdmin}>
      <h1>{isChangeRequest ? 'Request access change' : 'Request workspace access'}</h1>
      {hasPendingRequest && (
        <div className="notice">
          <strong>Access request already pending.</strong>
          Wait for admin review, or cancel your pending request before submitting a different one.
        </div>
      )}
      {isChangeRequest && (
        <div className="notice notice-warning">
          <strong>This submits a replacement request.</strong>
          Your current approved grant becomes unavailable while the new request is pending.
        </div>
      )}
      {hasLiveWorkspace && (
        <div className="notice notice-danger">
          <strong>Stop your active workspace first.</strong>
          You can request access changes after the running workspace is stopped.
        </div>
      )}
      {hasPendingRequest || hasLiveWorkspace ? (
        <p>
          <a href="/grants" className="btn btn-ghost">
            Back to grants
          </a>
        </p>
      ) : environments.length === 0 ? (
        <p>No environments enabled.</p>
      ) : (
        <form className="plain-form" method="post" action="/grants">
          <label>
            Environment
            <select name="runtimeImageId" required>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            GPU target
            <select name="gpuTarget" required>
              <option value="auto">any available GPU</option>
              {gpuTargets.map((target) => (
                <option key={target} value={target}>
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
              defaultValue="2"
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
              defaultValue="4"
              required
            />
            <small>Maximum {settings.maxRequestMemoryGb} GB per request.</small>
          </label>
          <label>
            Purpose <input name="purpose" maxLength={500} />
          </label>
          <button type="submit">
            {isChangeRequest ? 'Submit change request' : 'Submit request'}
          </button>
        </form>
      )}
    </Layout>
  );
}

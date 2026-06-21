import { Layout } from '@/views/layouts/Layout';

interface ActiveWorkspace {
  id: string;
  status: string;
  failureReason?: string | null;
  publishedPort?: number | null;
}

interface ActiveWorkspacePageProps {
  fullName: string;
  isAdmin: boolean;
  activeWorkspace: ActiveWorkspace | null;
  workspaceUrl: string | null;
  message: string | null;
}

export function ActiveWorkspacePage({
  fullName,
  isAdmin,
  activeWorkspace,
  workspaceUrl,
  message,
}: ActiveWorkspacePageProps) {
  const pollingScript =
    activeWorkspace?.status === 'starting'
      ? `(function() {
  var id = '${activeWorkspace.id}';
  var delay = 3000;
  var attempts = 0;
  var statusEl = document.getElementById('workspace-status');
  var titleEl = document.getElementById('workspace-title');
  var hintEl = document.getElementById('workspace-hint');
  var actionsEl = document.getElementById('workspace-actions');

  function text(value) {
    return document.createTextNode(value);
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function actionLink(href, label) {
    var link = document.createElement('a');
    link.href = href;
    link.className = 'btn btn-primary';
    link.appendChild(text(label));
    return link;
  }

  function setStatus(data) {
    if (statusEl) statusEl.textContent = data.status || 'unknown';
    if (!titleEl || !hintEl || !actionsEl) return;

    if (data.status === 'running' && data.workspaceUrl) {
      titleEl.textContent = 'Ready';
      hintEl.textContent = 'Your GPU session is online.';
      clear(actionsEl);
      var open = document.createElement('a');
      open.href = data.workspaceUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      open.className = 'btn btn-primary';
      open.appendChild(text('Open notebook'));
      actionsEl.appendChild(open);
      var form = document.createElement('form');
      form.method = 'post';
      form.action = '/workspaces/stop/' + id;
      var stop = document.createElement('button');
      stop.type = 'submit';
      stop.className = 'btn btn-ghost';
      stop.appendChild(text('Stop session'));
      form.appendChild(stop);
      actionsEl.appendChild(form);
      return;
    }

    if (data.status === 'failed') {
      titleEl.textContent = 'Launch failed';
      hintEl.textContent = data.failureReason || 'We could not start your session. Your grant is still approved, so you can retry.';
      clear(actionsEl);
      actionsEl.appendChild(actionLink('/grants', 'Back to grants'));
      return;
    }

    if (data.status && data.status !== 'starting') {
      titleEl.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      hintEl.textContent = 'This session is no longer starting.';
      clear(actionsEl);
      actionsEl.appendChild(actionLink('/workspaces/active', 'Refresh'));
    }
  }

  function poll() {
    fetch('/workspaces/status/' + id)
      .then(function(r) {
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
      })
      .then(function(data) {
        setStatus(data);
        if (data.status !== 'starting') {
          return;
        }
        attempts += 1;
        if (attempts > 20) delay = Math.min(delay + 3000, 15000);
        window.setTimeout(poll, delay);
      })
      .catch(function() { window.setTimeout(poll, delay); });
  }
  window.setTimeout(poll, delay);
})();`
      : null;

  return (
    <Layout title="My Workspace - RPL GPU Platform" fullName={fullName} isAdmin={isAdmin}>
      <h1>My workspace</h1>

      {message && (
        <p>
          <strong>{message}</strong>
        </p>
      )}

      {!activeWorkspace && (
        <>
          <h2>No session running</h2>
          <p>Start a GPU session when you are ready.</p>
        </>
      )}

      {activeWorkspace && activeWorkspace.status === 'starting' && (
        <>
          <h2 id="workspace-title">Starting</h2>
          <p id="workspace-hint">Preparing your GPU session. This usually takes less than a minute.</p>
          <p>
            Status: <strong id="workspace-status">{activeWorkspace.status}</strong>
          </p>
          <div id="workspace-actions" className="btn-row">
            <form method="post" action={`/workspaces/stop/${activeWorkspace.id}`}>
              <button type="submit" className="btn btn-ghost">
                Cancel
              </button>
            </form>
          </div>
        </>
      )}

      {activeWorkspace && activeWorkspace.status === 'running' && (
        <>
          <h2>Ready</h2>
          <p>Your GPU session is online.</p>
          <p>
            Status: <strong>{activeWorkspace.status}</strong>
          </p>
          <div className="btn-row">
            {workspaceUrl && (
              <a href={workspaceUrl} target="_blank" rel="noopener" className="btn btn-primary">
                Open notebook
              </a>
            )}
            <form method="post" action={`/workspaces/stop/${activeWorkspace.id}`}>
              <button type="submit" className="btn btn-ghost">
                Stop session
              </button>
            </form>
          </div>
        </>
      )}

      {activeWorkspace &&
        activeWorkspace.status !== 'starting' &&
        activeWorkspace.status !== 'running' && (
          <>
            <h2>{activeWorkspace.status === 'failed' ? 'Launch failed' : activeWorkspace.status}</h2>
            {activeWorkspace.failureReason && <p>{activeWorkspace.failureReason}</p>}
          </>
        )}

      {pollingScript && <script dangerouslySetInnerHTML={{ __html: pollingScript }} />}
    </Layout>
  );
}

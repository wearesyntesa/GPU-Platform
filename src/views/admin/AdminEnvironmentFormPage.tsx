import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/views/layouts/Layout';

interface Environment {
  id: string;
  name: string;
  imageRef: string;
  description: string | null;
  pythonVersion: string | null;
  packageManifest: string;
  enabled: boolean;
}

interface FormData {
  name?: string;
  imageRef?: string;
  description?: string | null;
  pythonVersion?: string | null;
  packageManifest?: string;
  enabled?: boolean;
}

interface Validation {
  ok: boolean;
  messages: string[];
}

interface AdminEnvironmentFormPageProps {
  fullName: string;
  isAdmin: boolean;
  environment: Environment | null;
  formData?: FormData;
  validation?: Validation;
}

export function AdminEnvironmentFormPage({
  fullName,
  isAdmin,
  environment,
  formData,
  validation,
}: AdminEnvironmentFormPageProps) {
  const data = formData ?? environment;
  const title = environment ? 'Edit Environment' : 'New Environment';

  return (
    <Layout title={`${title} - RPL GPU Platform`} fullName={fullName} isAdmin={isAdmin}>
      <h1>{title}</h1>
      <p>
        <a href="/admin/environments" className="btn btn-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to list
        </a>
      </p>

      {validation && (
        <div className="notice">
          <strong>{validation.ok ? 'Validation passed' : 'Validation failed'}</strong>
          <ul>
            {validation.messages.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="plain-form"
        method="post"
        action={environment ? `/admin/environments/${environment.id}` : '/admin/environments'}
      >
        <div>
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={data?.name ?? ''}
            required
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="imageRef">Starting image</label>
          <input
            type="text"
            id="imageRef"
            name="imageRef"
            defaultValue={data?.imageRef ?? ''}
            required
            maxLength={500}
          />
          <small>
            The foundation for this environment. It must already include Python, pip, and the
            Jupyter startup command. The platform installs the packages below on top of it
            automatically before a workspace opens.
          </small>
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            maxLength={1000}
            defaultValue={data?.description ?? ''}
          />
        </div>
        <div>
          <label htmlFor="pythonVersion">Python version</label>
          <input
            type="text"
            id="pythonVersion"
            name="pythonVersion"
            defaultValue={data?.pythonVersion ?? ''}
            maxLength={20}
            placeholder="3.12"
          />
        </div>
        <div>
          <label htmlFor="packageManifest">Packages to install</label>
          <textarea
            id="packageManifest"
            name="packageManifest"
            maxLength={5000}
            required
            placeholder={'jupyterlab\nnumpy\npandas'}
            defaultValue={data?.packageManifest ?? ''}
          />
          <small>
            One Python package per line, for example <code>numpy</code> or{' '}
            <code>pandas==2.0.0</code>. When this list changes, the platform rebuilds and replaces
            this environment image automatically. Include <code>jupyterlab</code> unless the
            starting image already provides it.
          </small>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={!environment || environment.enabled}
            />
            Enabled
          </label>
        </div>
        <div className="btn-row">
          <button
            type="submit"
            className="btn btn-ghost"
            formAction={
              environment
                ? `/admin/environments/${environment.id}/validate`
                : '/admin/environments/validate'
            }
          >
            Test configuration
          </button>
          <button type="submit" className="btn btn-primary">
            {environment ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

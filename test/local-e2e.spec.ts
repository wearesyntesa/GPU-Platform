import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const appUrl = process.env.E2E_APP_URL ?? 'http://127.0.0.1:3417';
const caddyUrl = process.env.E2E_CADDY_URL ?? 'http://192.168.10.13:18080';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://rpl:rpl@localhost:15432/rpl_gpu';
const credentials = {
  admin: {
    username: process.env.E2E_ADMIN_USER ?? 'admin',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'adminlabrpl',
  },
  user: {
    username: process.env.E2E_STUDENT_USER ?? 'student01',
    password: process.env.E2E_STUDENT_PASSWORD ?? 'Student01Lab!',
  },
};

function localClient(baseUrl: string) {
  const cookies = new Map<string, string>();
  const storeCookies = (headers: Headers): void => {
    for (const raw of headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      if (!pair) continue;
      const separator = pair.indexOf('=');
      if (separator !== -1) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };
  const cookieHeader = (): string =>
    Array.from(cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  const request = async (path: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers ?? {});
    const cookie = cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    const response = await fetch(new URL(path, baseUrl), {
      ...options,
      headers,
      redirect: 'manual',
    });
    storeCookies(response.headers);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) return request(location);
    }
    return response;
  };
  const form = (path: string, data: Record<string, string>): Promise<Response> =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
    });
  return { request, form };
}

async function login(
  client: ReturnType<typeof localClient>,
  role: 'admin' | 'user',
): Promise<void> {
  const response = await client.form('/login', credentials[role]);
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body.toLowerCase()).toContain('access');
}

async function withDb<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function resetStudentLiveAccess(): Promise<void> {
  const serviceIds = await withDb(async (client) => {
    const result = await client.query(
      `
      select s.swarm_service_id
      from sessions s
      join users u on u.id = s.user_id
      where u.username = $1
        and s.status in ('starting', 'running', 'stopping')
        and s.swarm_service_id is not null
    `,
      [credentials.user.username],
    );
    return result.rows.map((row) => row.swarm_service_id as string);
  });
  for (const serviceId of serviceIds) {
    await execFileAsync('docker', ['service', 'rm', serviceId]).catch(() => undefined);
  }

  await withDb(async (client) => {
    await client.query(
      `
      update sessions s
      set status = 'stopped', stop_reason = 'test_reset', stopped_at = now(), updated_at = now()
      from users u
      where s.user_id = u.id
        and u.username = $1
        and s.status in ('starting', 'running', 'stopping')
    `,
      [credentials.user.username],
    );
    await client.query(
      `
      update session_requests sr
      set status = 'cancelled', updated_at = now()
      from users u
      where sr.user_id = u.id
        and u.username = $1
        and sr.status in ('pending', 'approved')
    `,
      [credentials.user.username],
    );
  });
}

async function deploymentForPurpose(purpose: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `
      select sr.runtime_image_id, sr.requested_cpu, sr.requested_memory_gb, ri.image_ref,
             s.swarm_service_id, s.proxy_path, s.published_port
      from session_requests sr
      join runtime_images ri on ri.id = sr.runtime_image_id
      join sessions s on s.request_id = sr.id
      where sr.purpose = $1
      order by s.created_at desc
      limit 1
    `,
      [purpose],
    );
    return result.rows[0];
  });
}

function matchOrThrow(pattern: RegExp, input: string, message: string): RegExpMatchArray {
  const match = input.match(pattern);
  if (!match) throw new Error(message);
  return match;
}

describe.skipIf(process.env.RUN_LOCAL_E2E !== '1')('local app smoke and workspace E2E', () => {
  it('covers UI smoke and full workspace deployment through Swarm', async () => {
    const student = localClient(appUrl);
    const admin = localClient(appUrl);

    const loginPage = await student.request('/login');
    expect(await loginPage.text()).toContain('username');

    await login(student, 'user');
    await resetStudentLiveAccess();

    const formBody = await (await student.request('/grants/new')).text();
    expect(formBody).toContain('select name="gpuTarget"');
    expect(formBody).toContain('name="requestedCpu"');
    expect(formBody).toContain('name="requestedMemoryGb"');
    const environmentMatch = matchOrThrow(
      /<option value="([^"]+)">\s*([^<]+?)\s*<\/option>/,
      formBody,
      'environment option not found',
    );
    const environmentId = environmentMatch[1]!;
    const environmentName = environmentMatch[2]!.trim();

    const cancelCreateResponse = await student.form('/grants', {
      runtimeImageId: environmentId,
      gpuTarget: 'auto',
      requestedCpu: '1',
      requestedMemoryGb: '1',
      purpose: `local-cancel-${Date.now()}`,
    });
    expect(cancelCreateResponse.status).toBe(200);
    const duplicateCreateResponse = await student.form('/grants', {
      runtimeImageId: environmentId,
      gpuTarget: 'auto',
      requestedCpu: '1',
      requestedMemoryGb: '1',
      purpose: `local-duplicate-${Date.now()}`,
    });
    expect(duplicateCreateResponse.status).toBe(400);
    expect(await duplicateCreateResponse.text()).toContain(
      'You already have an active access request or grant',
    );
    const cancelBody = await (await student.request('/grants')).text();
    const cancelPath = matchOrThrow(
      /action="(\/grants\/[0-9a-f-]{36}\/cancel)"/,
      cancelBody,
      'cancel action not found',
    )[1]!;
    expect((await student.request(cancelPath, { method: 'POST' })).status).toBe(200);

    const purpose = `local-e2e-${Date.now()}`;
    expect(
      (
        await student.form('/grants', {
          runtimeImageId: environmentId,
          gpuTarget: 'auto',
          requestedCpu: '1',
          requestedMemoryGb: '1',
          purpose,
        })
      ).status,
    ).toBe(200);

    await login(admin, 'admin');
    const adminBody = await (await admin.request('/admin')).text();
    expect(adminBody).toContain('Requester');
    expect(adminBody).toContain(environmentName);
    const reviewPath = matchOrThrow(
      /href="(\/admin\/grants\/[0-9a-f-]{36})"/,
      adminBody,
      'review link not found',
    )[1]!;
    const detailBody = await (await admin.request(reviewPath)).text();
    expect(detailBody).toContain('Requester');
    expect(detailBody).toContain('select name="gpuTarget"');
    expect(
      (
        await admin.form(`${reviewPath}/approve`, {
          runtimeImageId: environmentId,
          gpuTarget: 'auto',
          requestedCpu: '1',
          requestedMemoryGb: '1',
          reason: 'local e2e',
        })
      ).status,
    ).toBe(200);

    const grantBody = await (await student.request('/grants')).text();
    const startPath = matchOrThrow(
      /action="(\/workspaces\/start\/[0-9a-f-]{36})"/,
      grantBody,
      'start action not found',
    )[1]!;
    expect((await student.request(startPath, { method: 'POST' })).status).toBe(200);

    for (let attempt = 1; attempt <= 45; attempt += 1) {
      const body = await (await student.request('/workspaces/active')).text();
      if (!body.includes('Workspace running')) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }

      const deployment = await deploymentForPurpose(purpose);
      expect(deployment.runtime_image_id).toBe(environmentId);
      const { stdout } = await execFileAsync('docker', [
        'service',
        'inspect',
        deployment.swarm_service_id,
        '--format',
        '{{json .Spec}}',
      ]);
      const spec = JSON.parse(stdout);
      expect(spec.TaskTemplate.ContainerSpec.Image).toMatch(
        /^rpl-gpu-env-local-jupyter-[0-9a-f]{8}:current$/,
      );
      expect(spec.TaskTemplate.ContainerSpec.Image).not.toBe(deployment.image_ref);
      expect(spec.TaskTemplate.ContainerSpec.Env).toContain(
        `JUPYTER_BASE_URL=${deployment.proxy_path}/`,
      );
      expect(spec.TaskTemplate.Resources.Limits.NanoCPUs).toBe(
        deployment.requested_cpu * 1_000_000_000,
      );
      expect(spec.TaskTemplate.Resources.Limits.MemoryBytes).toBe(
        deployment.requested_memory_gb * 1024 * 1024 * 1024,
      );

      const workspaceUrl = matchOrThrow(
        new RegExp(
          `href="(${caddyUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/workspaces\\/[^"]+)"`,
        ),
        body,
        'workspace URL not found',
      )[1]!;
      const proxyResponse = await fetch(workspaceUrl);
      expect(proxyResponse.status).toBe(200);
      expect(await proxyResponse.text()).toMatch(/jupyter|lab/i);
      const stopPath = matchOrThrow(
        /action="(\/workspaces\/[0-9a-f-]{36}\/stop)"/,
        body,
        'stop action not found',
      )[1]!;
      expect((await student.request(stopPath, { method: 'POST' })).status).toBe(200);
      await resetStudentLiveAccess();
      return;
    }

    throw new Error('workspace did not reach running');
  }, 180_000);
});

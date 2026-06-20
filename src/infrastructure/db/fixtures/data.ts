export const userFixtures = [
  { username: 'admin', password: 'adminlabrpl', role: 'admin' as const },
  { username: 'student01', password: 'Student01Lab!', role: 'user' as const },
];

export const environmentFixtures = [
  {
    name: 'Local Jupyter',
    imageRef: 'rpl/jupyter-local:dev',
    description: 'Local CPU-only Jupyter environment for single-node Swarm development.',
    pythonVersion: '3.12',
    packageManifest: 'jupyterlab\nnumpy\npandas\nmatplotlib',
    enabled: true,
  },
];

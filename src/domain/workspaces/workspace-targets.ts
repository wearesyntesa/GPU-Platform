export function isWildcardGpuTarget(gpuTarget: string): boolean {
  const normalized = gpuTarget.trim();
  return normalized === '' || normalized === 'auto' || normalized === 'any';
}

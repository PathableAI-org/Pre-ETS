import type { TenantWorld } from "./world.ts"

export function closeOwnedResources(_world: TenantWorld): void {
  // TODO: close Playwright contexts and terminate the owned test process
}

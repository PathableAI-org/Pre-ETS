import { fileURLToPath } from "node:url"

if ((process.env.TENANT_CONFIG_DIR?.trim() ?? "") === "") {
  process.env.TENANT_CONFIG_DIR = fileURLToPath(new URL("../../fixtures/tenant-config", import.meta.url))
}

import { fileURLToPath } from "node:url"

if ((process.env.TENANT_CONFIG_DIR?.trim() ?? "") === "") {
  process.env.TENANT_CONFIG_DIR = fileURLToPath(new URL("../../fixtures/tenant-config", import.meta.url))
}

if ((process.env.TENANT_RESOLUTION?.trim() ?? "") === "") {
  process.env.TENANT_RESOLUTION = "host"
}

if ((process.env.BASE_HOSTNAME?.trim() ?? "") === "") {
  process.env.BASE_HOSTNAME = "example.test"
}

import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../dist", import.meta.url));
if (!output.endsWith(`${process.platform === "win32" ? "\\" : "/"}dist`)) {
  throw new Error(`Refusing to clean unexpected path: ${output}`);
}
await rm(output, { recursive: true, force: true });

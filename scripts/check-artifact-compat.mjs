import { readFile } from "node:fs/promises";
import { ARTIFACT_PROTOCOL_VERSION } from "@elqora/artifacts";
import {
  ARTIFACT_PACKAGE_COMPATIBILITY,
  ARTIFACT_PROTOCOL_COMPATIBILITY,
} from "../dist/index.js";

const packageFile = new URL("../node_modules/@elqora/artifacts/package.json", import.meta.url);
const artifactPackage = JSON.parse(await readFile(packageFile, "utf8"));
if (!artifactPackage.version.startsWith("0.2.")) throw new Error(`Expected local @elqora/artifacts 0.2.x, got ${artifactPackage.version}`);
if (ARTIFACT_PROTOCOL_VERSION !== "1.1") throw new Error(`Expected Artifact Protocol 1.1, got ${ARTIFACT_PROTOCOL_VERSION}`);
if (ARTIFACT_PACKAGE_COMPATIBILITY !== ">=0.2.0 <0.3.0" || ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.1 <2.0") throw new Error("Declared Artifact compatibility range changed unexpectedly");
let localStatus = "local source not present";
try {
  const localPackage = JSON.parse(await readFile(new URL("../../elqora/artifacts/packages/typescript/package.json", import.meta.url), "utf8"));
  if (!localPackage.version.startsWith("0.2.")) throw new Error(`Local Artifact package ${localPackage.version} differs from installed ${artifactPackage.version}`);
  const localSource = await readFile(new URL("../../elqora/artifacts/packages/typescript/src/index.ts", import.meta.url), "utf8");
  if (!localSource.includes(`ARTIFACT_PROTOCOL_VERSION = "${ARTIFACT_PROTOCOL_VERSION}"`)) throw new Error("Local Artifact Protocol source version differs from installed runtime");
  localStatus = `local source ${localPackage.version}`;
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
console.log(`artifact compatibility verified (npm ${artifactPackage.version}, protocol ${ARTIFACT_PROTOCOL_VERSION}, ${localStatus})`);

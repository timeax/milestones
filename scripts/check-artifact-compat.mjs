import { readFile } from "node:fs/promises";
import { ARTIFACT_PROTOCOL_VERSION } from "@elqora/artifacts";
import {
  ARTIFACT_PACKAGE_COMPATIBILITY,
  ARTIFACT_PROTOCOL_COMPATIBILITY,
} from "../dist/index.js";

const packageFile = new URL("../node_modules/@elqora/artifacts/package.json", import.meta.url);
const artifactPackage = JSON.parse(await readFile(packageFile, "utf8"));
if (artifactPackage.version !== "0.1.0") throw new Error(`Expected local @elqora/artifacts 0.1.0, got ${artifactPackage.version}`);
if (ARTIFACT_PROTOCOL_VERSION !== "1.0") throw new Error(`Expected Artifact Protocol 1.0, got ${ARTIFACT_PROTOCOL_VERSION}`);
if (ARTIFACT_PACKAGE_COMPATIBILITY !== ">=0.1.0 <0.2.0" || ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.0 <2.0") throw new Error("Declared Artifact compatibility range changed unexpectedly");
console.log(`artifact compatibility verified (package ${artifactPackage.version}, protocol ${ARTIFACT_PROTOCOL_VERSION})`);

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "elqora-milestones-smoke-"));

try {
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
  );
  const packed = JSON.parse(packOutput);
  if (!Array.isArray(packed) || typeof packed[0]?.filename !== "string") {
    throw new Error("npm pack did not return a tarball filename");
  }

  const tarball = join(temporaryDirectory, packed[0].filename);
  await writeFile(join(temporaryDirectory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "@elqora/artifacts@0.1.0"],
    { cwd: temporaryDirectory, stdio: "pipe", shell: process.platform === "win32" },
  );
  await writeFile(
    join(temporaryDirectory, "smoke.mjs"),
    `import { ARTIFACT_PROTOCOL_COMPATIBILITY, MilestoneEditor } from "@elqora/milestones";\nimport { evaluateAcceptance } from "@elqora/milestones/evaluation";\nimport { createGraphSnapshot } from "@elqora/milestones/graph";\nimport { serializeMilestone } from "@elqora/milestones/serialization";\nimport { validateMilestone } from "@elqora/milestones/validation";\nimport { FixedMilestoneClock } from "@elqora/milestones/testing";\nimport { MilestoneDomainError } from "@elqora/milestones/model";\nimport { migrateMilestoneWire } from "@elqora/milestones/migrations";\nif ([MilestoneEditor, evaluateAcceptance, createGraphSnapshot, serializeMilestone, validateMilestone, FixedMilestoneClock, MilestoneDomainError, migrateMilestoneWire].some(value => typeof value !== "function") || ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.0 <2.0") throw new Error("package import failed");\ntry { await import("@elqora/milestones/editors/internal/session"); throw new Error("internal import unexpectedly succeeded"); } catch (error) { const expected = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || String(error).includes("Cannot find module '@elqora/milestones/editors/internal/session'"); if (!expected) throw error; }\n`,
  );
  execFileSync("node", [join(temporaryDirectory, "smoke.mjs")], {
    cwd: temporaryDirectory,
    stdio: "pipe",
  });
  if (spawnSync("bun", ["--version"], { shell: process.platform === "win32" }).status === 0) {
    execFileSync("bun", [join(temporaryDirectory, "smoke.mjs")], {
      cwd: temporaryDirectory,
      stdio: "pipe",
      shell: process.platform === "win32",
    });
  }

  await writeFile(
    join(temporaryDirectory, "smoke.ts"),
    `import { MilestoneEditor, type MilestoneEditorOptions, type Milestone } from "@elqora/milestones";\nimport type { MilestoneProfile } from "@elqora/milestones/model";\nimport { evaluateAcceptance } from "@elqora/milestones/evaluation";\nimport { createGraphSnapshot } from "@elqora/milestones/graph";\nimport { serializeMilestone } from "@elqora/milestones/serialization";\nimport { validateMilestone } from "@elqora/milestones/validation";\nimport { FixedMilestoneClock } from "@elqora/milestones/testing";\nimport { migrateMilestoneWire } from "@elqora/milestones/migrations";\ndeclare const milestone: Milestone; declare const profile: MilestoneProfile; declare const options: MilestoneEditorOptions;\nnew MilestoneEditor(milestone, profile, options); void [evaluateAcceptance, createGraphSnapshot, serializeMilestone, validateMilestone, FixedMilestoneClock, migrateMilestoneWire];\n`,
  );
  execFileSync(
    "node",
    [join(fileURLToPath(root), "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck", "false", join(temporaryDirectory, "smoke.ts")],
    { cwd: temporaryDirectory, stdio: "pipe" },
  );

  const installed = JSON.parse(
    await readFile(join(temporaryDirectory, "node_modules", "@elqora", "milestones", "package.json"), "utf8"),
  );
  if (installed.name !== "@elqora/milestones" || installed.license !== "Unlicense") {
    throw new Error("installed package metadata is inconsistent");
  }
  console.log(`package smoke verified (${installed.name}@${installed.version}, ${installed.license})`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

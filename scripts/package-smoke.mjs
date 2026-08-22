import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "timeax-milestones-smoke-"));

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
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "@elqora/artifacts@0.2.0"],
    { cwd: temporaryDirectory, stdio: "pipe", shell: process.platform === "win32" },
  );
  await writeFile(
    join(temporaryDirectory, "smoke.mjs"),
    `import { ARTIFACT_PROTOCOL_COMPATIBILITY, MilestoneEditor, TaskEditor, BreakdownEditor, MilestoneDocument, MilestoneDocumentBuilder, createMilestoneDocument, createMilestoneDocumentContext, createTaskDocument, createBreakdownDocument } from "@timeax/milestones";\nimport { evaluateAcceptance } from "@timeax/milestones/evaluation";\nimport { createGraphSnapshot } from "@timeax/milestones/graph";\nimport { serializeMilestone } from "@timeax/milestones/serialization";\nimport { validateMilestone } from "@timeax/milestones/validation";\nimport { FixedMilestoneClock } from "@timeax/milestones/testing";\nimport { MilestoneDomainError } from "@timeax/milestones/model";\nimport { migrateMilestoneWire } from "@timeax/milestones/migrations";\nimport { MilestoneDocument as DomMilestoneDocument, MilestoneDocumentBuilder as DomMilestoneDocumentBuilder, createMilestoneDocument as domCreateMilestoneDocument, createMilestoneDocumentContext as domCreateMilestoneDocumentContext, createTaskDocument as domCreateTaskDocument, createBreakdownDocument as domCreateBreakdownDocument } from "@timeax/milestones/dom";\nif ([MilestoneEditor, TaskEditor, BreakdownEditor, evaluateAcceptance, createGraphSnapshot, serializeMilestone, validateMilestone, FixedMilestoneClock, MilestoneDomainError, migrateMilestoneWire, MilestoneDocument, MilestoneDocumentBuilder, createMilestoneDocument, createMilestoneDocumentContext, createTaskDocument, createBreakdownDocument, DomMilestoneDocument, DomMilestoneDocumentBuilder, domCreateMilestoneDocument, domCreateMilestoneDocumentContext, domCreateTaskDocument, domCreateBreakdownDocument].some(value => typeof value !== "function") || ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.1 <2.0") throw new Error("package import failed");\nif (createMilestoneDocument !== domCreateMilestoneDocument || createTaskDocument !== domCreateTaskDocument || createBreakdownDocument !== domCreateBreakdownDocument || MilestoneDocument !== DomMilestoneDocument || MilestoneDocumentBuilder !== DomMilestoneDocumentBuilder || createMilestoneDocumentContext !== domCreateMilestoneDocumentContext) throw new Error("DOM subpath export identity mismatch");\ntry { await import("@timeax/milestones/editors/internal/session"); throw new Error("internal import unexpectedly succeeded"); } catch (error) { const expected = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || String(error).includes("Cannot find module '@timeax/milestones/editors/internal/session'"); if (!expected) throw error; }\ntry { await import("@timeax/milestones/dom/documents/criteria"); throw new Error("internal DOM import unexpectedly succeeded"); } catch (error) { const expected = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || String(error).includes("Cannot find module '@timeax/milestones/dom/documents/criteria'"); if (!expected) throw error; }\n`,
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
    `import { MilestoneEditor, TaskEditor, BreakdownEditor, type MilestoneEditorOptions, type Milestone, type Task, type Breakdown, MilestoneDocument, MilestoneDocumentBuilder, createMilestoneDocument, createMilestoneDocumentContext, createTaskDocument, createBreakdownDocument, type MilestoneDocumentContract } from "@timeax/milestones";\nimport type { MilestoneProfile, TaskProfile } from "@timeax/milestones/model";\nimport { evaluateAcceptance } from "@timeax/milestones/evaluation";\nimport { createGraphSnapshot } from "@timeax/milestones/graph";\nimport { serializeMilestone } from "@timeax/milestones/serialization";\nimport { validateMilestone } from "@timeax/milestones/validation";\nimport { FixedMilestoneClock } from "@timeax/milestones/testing";\nimport { migrateMilestoneWire } from "@timeax/milestones/migrations";\nimport { createMilestoneDocument as domCreateMilestoneDocument, createTaskDocument as domCreateTaskDocument, createBreakdownDocument as domCreateBreakdownDocument, type MilestoneDocumentContract as DomMilestoneDocumentContract } from "@timeax/milestones/dom";\ndeclare const milestone: Milestone; declare const task: Task; declare const breakdown: Breakdown; declare const profile: MilestoneProfile; declare const taskProfile: TaskProfile; declare const options: MilestoneEditorOptions;\nnew MilestoneEditor(milestone, profile, options); void [TaskEditor, BreakdownEditor, evaluateAcceptance, createGraphSnapshot, serializeMilestone, validateMilestone, FixedMilestoneClock, migrateMilestoneWire];\ndeclare const doc: MilestoneDocumentContract; declare const domDoc: DomMilestoneDocumentContract;\nconst createdDoc = createMilestoneDocument({ milestone, profile }); const taskDoc = createTaskDocument({ task, profile: taskProfile }); const breakdownDoc = createBreakdownDocument({ breakdown }); const builderDoc = new MilestoneDocumentBuilder(milestone, profile).build(); const subpathDoc = domCreateMilestoneDocument({ milestone, profile }); const subpathTaskDoc = domCreateTaskDocument({ task, profile: taskProfile }); const subpathBreakdownDoc = domCreateBreakdownDocument({ breakdown });\nvoid [doc, domDoc, createdDoc, taskDoc, breakdownDoc, builderDoc, subpathDoc, subpathTaskDoc, subpathBreakdownDoc, MilestoneDocument, createMilestoneDocumentContext];\n`,
  );
  execFileSync(
    "node",
    [join(fileURLToPath(root), "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck", "false", join(temporaryDirectory, "smoke.ts")],
    { cwd: temporaryDirectory, stdio: "pipe" },
  );

  const installed = JSON.parse(
    await readFile(join(temporaryDirectory, "node_modules", "@timeax", "milestones", "package.json"), "utf8"),
  );
  if (installed.name !== "@timeax/milestones" || installed.license !== "Unlicense") {
    throw new Error("installed package metadata is inconsistent");
  }
  console.log(`package smoke verified (${installed.name}@${installed.version}, ${installed.license})`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

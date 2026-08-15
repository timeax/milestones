const pkg = await import("../dist/index.js");
if (typeof pkg.MilestoneEditor !== "function") throw new Error("MilestoneEditor is not exported");
if (pkg.ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.0 <2.0") throw new Error("Artifact protocol compatibility mismatch");
console.log(`exports verified (${Object.keys(pkg).length} runtime exports)`);

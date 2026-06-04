async function runStep(command: string[]) {
  const proc = Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (process.env.STORE_DRIVER === "postgres") {
  console.log("[startup] Running database migrations...");
  await runStep(["bun", "scripts/run-migration.ts"]);
} else {
  console.log("[startup] STORE_DRIVER is not postgres; skipping migrations.");
}

await import("../dist/backend.js");

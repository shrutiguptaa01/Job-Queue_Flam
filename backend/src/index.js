#!/usr/bin/env node
// src/index.js - CLI entrypoint
const { program } = require("commander");
const { v4: uuidv4 } = require("uuid");
const { initDB, Job } = require("./db");
const { DEFAULTS } = require("./config");
const { spawn } = require("child_process");
const path = require("path");

async function ensureDB(opts = {}) {
  const uri = opts.mongoUri || DEFAULTS.mongo_uri;
  await initDB(uri);
}

program.name("queuectl").description("QueueCTL - CLI job queue (Node + MongoDB)").version("1.0.0");

program
  .command("init")
  .description("initialize DB (creates indexes)")
  .option("--mongo <uri>", "mongo URI")
  .action(async (opts) => {
    await ensureDB({ mongoUri: opts.mongo });
    console.log("[init] DB ready");
    process.exit(0);
  });

program
  .command("enqueue")
  .description("enqueue a job")
  .requiredOption("-c, --command <cmd>", "command to run")
  .option("--id <id>", "job id")
  .option("--max-retries <n>", "per-job max retries", parseInt)
  .option("--run-at <epoch>", "unix epoch seconds to run", parseFloat)
  .action(async (opts) => {
    await ensureDB();
    const id = opts.id || uuidv4();
    const runAt = opts.runAt ? new Date(Number(opts.runAt) * 1000) : new Date(0);
    const job = new Job({
      _id: id,
      command: opts.command,
      max_retries: opts.maxRetries ?? null,
      runAt
    });
    await job.save();
    console.log(`[enqueue] added job id=${id}`);
    process.exit(0);
  });

program
  .command("worker")
  .description("start N workers (spawns child processes)")
  .option("--count <n>", "number of worker processes", parseInt, 1)
  .option("--poll <ms>", "poll interval ms", parseInt, 1000)
  .option("--mongo <uri>", "mongo URI")
  .option("--backoff-base <n>", "backoff base", parseFloat)
  .option("--backoff-cap <n>", "backoff cap seconds", parseFloat)
  .option("--max-retries <n>", "global max retries", parseInt)
  .action(async (opts) => {
    // check DB
    await ensureDB({ mongoUri: opts.mongo });
    const workerScript = path.join(__dirname, "worker.js");
    const procs = [];
    console.log(`[workers] starting ${opts.count} worker(s). Ctrl-C to stop.`);
    for (let i = 0; i < opts.count; i++) {
      const env = Object.assign({}, process.env, {
        POLL_MS: String(opts.poll),
        BACKOFF_BASE: opts.backoffBase || "",
        BACKOFF_CAP: opts.backoffCap || "",
        MAX_RETRIES: opts.maxRetries ? String(opts.maxRetries) : "",
        MONGO_URI: opts.mongo || ""
      });
      const p = spawn(process.execPath, [workerScript], { stdio: "inherit", env });
      procs.push(p);
    }

    // on parent SIGINT -> forward to children for graceful shutdown
    function shutdown() {
      console.log("[parent] shutting down workers...");
      for (const p of procs) {
        try { p.kill("SIGINT"); } catch (e) {}
      }
      setTimeout(() => process.exit(0), 2000);
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // keep parent alive
  });

program
  .command("status")
  .description("show counts by state")
  .action(async () => {
    await ensureDB();
    const states = await Job.aggregate([
      { $group: { _id: "$state", count: { $sum: 1 } } }
    ]).exec();
    const map = {};
    for (const s of states) map[s._id] = s.count;
    ["pending", "processing", "completed", "failed", "dead"].forEach((st) =>
      console.log(`${st}: ${map[st] || 0}`)
    );
    process.exit(0);
  });

program
  .command("list")
  .description("list jobs (optionally filter by state)")
  .option("--state <s>", "pending|processing|completed|dead")
  .action(async (opts) => {
    await ensureDB();
    const q = {};
    if (opts.state) q.state = opts.state;
    const rows = await Job.find(q).sort({ createdAt: 1 }).lean().exec();
    for (const r of rows) {
      console.log(`- id=${r._id} state=${r.state} attempts=${r.attempts} cmd=${r.command} runAt=${r.runAt}`);
    }
    process.exit(0);
  });

program
  .command("dlq")
  .description("DLQ operations")
  .command("list")
  .description("list dead jobs")
  .action(async () => {
    await ensureDB();
  });

const dlq = program.command("dlq");
dlq
  .command("list")
  .description("list dead jobs")
  .action(async () => {
    await ensureDB();
    const rows = await Job.find({ state: "dead" }).sort({ updatedAt: 1 }).lean().exec();
    for (const r of rows) {
      console.log(`- id=${r._id} attempts=${r.attempts} lastError=${r.lastError}`);
    }
    process.exit(0);
  });

dlq
  .command("retry")
  .description("move dead job back to pending")
  .argument("<jobId>")
  .action(async (jobId) => {
    await ensureDB();
    const found = await Job.findById(jobId).exec();
    if (!found || found.state !== "dead") {
      console.error("DLQ job not found");
      process.exit(1);
    }
    found.state = "pending";
    found.updatedAt = new Date();
    found.runAt = new Date(0);
    await found.save();
    console.log(`[dlq] job ${jobId} moved to pending`);
    process.exit(0);
  });

program
  .command("config")
  .description("view/set config via environment or defaults")
  .option("--set <key> <value>", "set config key value")
  .action(async (opts) => {
    // for this simple example, config is via CLI flags or env; to make persistent config you'd use a config collection
    console.log("Config is managed via CLI flags / env. Defaults:");
    console.log(`  max_retries = ${DEFAULTS.max_retries}`);
    console.log(`  backoff_base = ${DEFAULTS.backoff_base}`);
    console.log(`  backoff_cap = ${DEFAULTS.backoff_cap}`);
    process.exit(0);
  });

program.parse(process.argv);

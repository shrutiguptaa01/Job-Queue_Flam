#!/usr/bin/env node
// src/worker.js
// This file can run as a worker process. It claims and executes jobs in a loop.

const { connect, Job } = require("./db");
const { computeBackoff } = require("./util");
const { DEFAULTS } = require("./config");
const { exec } = require("child_process");

let stopping = false;
let currentJobId = null;

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

function handleSignal() {
  console.log("[worker] received shutdown signal. Will stop after current job.");
  stopping = true;
}

async function claimJob() {
  // Find one pending job whose runAt <= now and atomically update it to processing and increment attempts
  const now = new Date();
  const doc = await Job.findOneAndUpdate(
    { state: "pending", runAt: { $lte: now } },
    {
      $set: { state: "processing", updatedAt: new Date() },
      $inc: { attempts: 1 }
    },
    { sort: { createdAt: 1 }, returnDocument: "after" } // returns the updated doc
  ).exec();
  return doc;
}

async function completeJob(jobId) {
  await Job.findByIdAndUpdate(jobId, { state: "completed", updatedAt: new Date() }).exec();
}

async function moveToDLQ(jobDoc, reason) {
  // create a new document in `dead` state so we keep history, or keep in separate collection if you prefer
  await Job.findByIdAndUpdate(jobDoc._id, {
    state: "dead",
    updatedAt: new Date(),
    lastError: reason
  }).exec();
}

async function scheduleRetry(jobDoc, reason, delaySecs) {
  const nextRun = new Date(Date.now() + Math.floor(delaySecs * 1000));
  await Job.findByIdAndUpdate(jobDoc._id, {
    state: "pending",
    updatedAt: new Date(),
    runAt: nextRun,
    lastError: reason
  }).exec();
}

async function runJobCommand(jobDoc) {
  return new Promise((resolve) => {
    // exec the command in shell
    const child = exec(jobDoc.command, { timeout: 60 * 60 * 1000 }, (error, stdout, stderr) => {
      const rc = error ? (error.code == null ? 1 : error.code) : 0;
      resolve({ rc, stdout, stderr, error });
    });
  });
}

async function workerLoop(opts = {}) {
  const poll = opts.poll || 1000;
  const base = opts.backoff_base ?? DEFAULTS.backoff_base;
  const cap = opts.backoff_cap ?? DEFAULTS.backoff_cap;
  const globalMax = opts.max_retries ?? DEFAULTS.max_retries;

  console.log(`[worker] started; poll=${poll}ms`);

  while (!stopping) {
    const job = await claimJob();
    if (!job) {
      // no job available
      await new Promise((r) => setTimeout(r, poll));
      continue;
    }
    currentJobId = job._id;
    console.log(`[worker] picked job=${job._id} attempts=${job.attempts} cmd=${job.command}`);

    try {
      const result = await runJobCommand(job);
      if (result.rc === 0) {
        console.log(`[worker] job ${job._id} succeeded`);
        await completeJob(job._id);
      } else {
        const attempts = job.attempts; // attempts was incremented when claimed
        const maxRetries = job.max_retries != null ? job.max_retries : globalMax;
        const reason = `exit_code=${result.rc} stderr=${String(result.stderr || "").slice(0, 200)}`;

        if (attempts >= (maxRetries || 0)) {
          console.log(`[worker] job ${job._id} exceeded retries (${attempts} >= ${maxRetries}) -> DLQ`);
          await moveToDLQ(job, reason);
        } else {
          const delay = computeBackoff(base, attempts, cap);
          console.log(`[worker] job ${job._id} failed -> scheduling retry in ${delay}s (attempt ${attempts})`);
          await scheduleRetry(job, reason, delay);
        }
      }
    } catch (ex) {
      const attempts = job.attempts;
      const maxRetries = job.max_retries != null ? job.max_retries : globalMax;
      const reason = `exception:${ex.message || ex}`;
      if (attempts >= (maxRetries || 0)) {
        await moveToDLQ(job, reason);
      } else {
        const delay = computeBackoff(base, attempts, cap);
        await scheduleRetry(job, reason, delay);
      }
    } finally {
      currentJobId = null;
    }
  }

  console.log("[worker] exiting gracefully");
  process.exit(0);
}

async function startWorker(options = {}) {
  await connect();
  await workerLoop(options);
}

// allow start as script with options via env
if (require.main === module) {
  const poll = parseInt(process.env.POLL_MS || "1000");
  const base = parseFloat(process.env.BACKOFF_BASE || "");
  const cap = parseFloat(process.env.BACKOFF_CAP || "");
  const max = process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : undefined;
  startWorker({ poll, backoff_base: base, backoff_cap: cap, max_retries: max }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { startWorker };

#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { connectDB } from "./src/db/mongo.js";
import { enqueueJob } from "./src/services/jobService.js";
import { getConfig, setConfig } from "./src/services/configService.js";
import { stopAllWorkers } from "./src/services/workerService.js";
import { spawn } from "child_process";
import Job from "./src/models/Job.js";
import DLQ from "./src/models/DLQ.js";

const program = new Command();

program
  .name("queuectl")
  .description("CLI Job Queue System")
  .version("1.0.0");

// -------------------------- SAFE JSON CLEANER --------------------------
function cleanJSON(input) {
  let str = input.trim();

  // Convert single quotes → double quotes
  if (str.includes("'")) {
    str = str.replace(/'/g, '"');
  }

  // Add quotes around keys: id: → "id":
  str = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

  // Add quotes around bare values: command:echo → command:"echo"
  str = str.replace(/:\s*([a-zA-Z0-9_\-\/\.]+)\s*([},])/g, ':"$1"$2');

  return str;
}

function safeParse(input) {
  try {
    return JSON.parse(input);
  } catch (e) {
    console.log(chalk.red("\n❌ Invalid JSON format!"));
    console.log("Example usage:");
    console.log(chalk.yellow(`queuectl enqueue '{"command":"echo hi"}'\n`));
    process.exit(1);
  }
}


// ---------------------- ENQUEUE ----------------------
program
  .command("enqueue")
  .argument("<json>")
  .description("Add a new job")
  .action(async (json) => {
    await connectDB();

    let input = json.trim();

    // If user writes: queuectl enqueue command:echo hi
    if (!input.startsWith("{")) {
      input = `{${input}}`;
    }

    // Remove outer accidental quotes:
    if ((input.startsWith('"') && input.endsWith('"')) ||
        (input.startsWith("'") && input.endsWith("'"))) {
      input = input.slice(1, -1);
    }

    // Convert single → double quotes
    input = input.replace(/'/g, '"');

    // Quote keys: command: → "command":
    input = input.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    // Quote values only when missing
    input = input.replace(/:\s*([^,"{}\s][^,}]*)/g, (match, value) => {
      if (!isNaN(value)) return `:${value}`; // number → no quotes
      return `:"${value}"`;
    });

    let jobData;
    try {
      jobData = JSON.parse(input);
    } catch (err) {
      console.log(chalk.red("\n❌ Still invalid format!"));
      console.log("Try:");
      console.log(chalk.yellow('queuectl enqueue {command:echo hi}'));
      process.exit(1);
    }

    // Auto ID
    if (!jobData.id) {
      jobData.id = "job-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    }

    const job = await enqueueJob(jobData);
    console.log(chalk.green("✔ Job added:"), job.id);
  });


// -------------------------- START WORKERS --------------------------
program
  .command("worker:start")
  .option("--count <n>", "Number of workers", "1")
  .description("Start workers")
  .action((opts) => {
    const count = parseInt(opts.count);
    spawn("node", ["./src/workers/worker.js", count], { stdio: "inherit" });
  });

// -------------------------- STOP WORKERS --------------------------
program
  .command("worker:stop")
  .description("Stop all workers gracefully")
  .action(async () => {
    await connectDB();  // optional if needed
    stopAllWorkers();
    console.log("✔ All workers stopping gracefully...");
  });


// -------------------------- LIST JOBS --------------------------
program
  .command("list")
  .option("--state <state>")
  .description("List jobs")
  .action(async (opts) => {
    await connectDB();
    const jobs = await Job.find(opts.state ? { state: opts.state } : {});
    console.log(jobs);
  });

// -------------------------- STATUS --------------------------
program
  .command("status")
  .description("Queue Status")
  .action(async () => {
    await connectDB();
    const counts = await Promise.all([
      Job.countDocuments({ state: "pending" }),
      Job.countDocuments({ state: "processing" }),
      Job.countDocuments({ state: "completed" }),
      Job.countDocuments({ state: "failed" })
    ]);

    console.log(`
Pending: ${counts[0]}
Processing: ${counts[1]}
Completed: ${counts[2]}
Failed: ${counts[3]}
    `);
  });

// -------------------------- DLQ LIST --------------------------
program
  .command("dlq:list")
  .description("Show Dead Letter Queue")
  .action(async () => {
    await connectDB();
    console.log(await DLQ.find());
  });


  // -------------------------- DLQ RETRY --------------------------
program
  .command("dlq:retry <jobId>")
  .description("Retry a job from Dead Letter Queue")
  .action(async (jobId) => {
    await connectDB();
    const job = await DLQ.findOne({ id: jobId });
    if (!job) {
      console.log(`❌ No job found in DLQ with id ${jobId}`);
      return;
    }

    // Move back to Job collection
    await Job.create({
      id: job.id,
      command: job.command,
      state: "pending",
      attempts: 0,
      max_retries: getConfig().max_retries,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Remove from DLQ
    await DLQ.deleteOne({ id: jobId });

    console.log(`✅ Job ${jobId} moved back to pending queue`);
  });

// -------------------------- LIST FAILED JOBS --------------------------
program
  .command("failed:list")
  .description("List all failed jobs")
  .action(async () => {
    await connectDB();
    const failedJobs = await Job.find({ state: "failed" });
    if (failedJobs.length === 0) {
      console.log("✅ No failed jobs found");
    } else {
      failedJobs.forEach(job => {
        console.log(`Job ID: ${job.id} | Command: ${job.command} | Attempts: ${job.attempts}`);
      });
    }
  });


// -------------------------- CONFIG SET --------------------------
program
  .command("config:set")
  .argument("<key>")
  .argument("<value>")
  .action((key, value) => {
    setConfig(key, Number(value));
    console.log("Updated config:", getConfig());
  });

program.parse();

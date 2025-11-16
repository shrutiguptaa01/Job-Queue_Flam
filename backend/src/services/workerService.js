import { spawn } from "child_process";
import Job from "../models/Job.js";
import { moveToDLQ } from "./jobService.js";
import { getConfig } from "./configService.js";

let stopWorkers = false;

export const stopAllWorkers = () => {
    stopWorkers = true;
};

export const startWorker = async (workerId) => {
    console.log(`Worker ${workerId} started`);

    while (!stopWorkers) {
        const job = await Job.findOneAndUpdate(
            { state: "pending" },
            { state: "processing", updated_at: new Date() }
        );

        if (!job) {
            await new Promise(res => setTimeout(res, 1000));
            continue;
        }

        console.log(`Worker ${workerId} executing job ${job.id}`);

        await executeJob(job);
    }

    console.log(`Worker ${workerId} stopped gracefully.`);
};

const executeJob = async (job) => {
    return new Promise((resolve) => {
        const proc = spawn(job.command, { shell: true });

        proc.on("close", async (code) => {
            job.updated_at = new Date();

            if (code === 0) {
                job.state = "completed";
                await job.save();
                return resolve();
            }

            job.attempts += 1;

            if (job.attempts > job.max_retries) {
                // Move to DLQ
                await moveToDLQ(job, "Max retries exceeded");

                // Mark as failed
                job.state = "failed";
                await job.save();
                console.log(`❌ Job ${job.id} failed and moved to DLQ`);
                return resolve();
            }

            const backoff = getConfig().backoff_base ** job.attempts;

            console.log(`Retrying job ${job.id} after ${backoff}s`);

            setTimeout(async () => {
                job.state = "pending";
                await job.save();
                resolve();
            }, backoff * 1000);
        });
    });
};

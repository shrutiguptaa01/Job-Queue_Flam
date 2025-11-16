import { v4 as uuidv4 } from "uuid";
import Job from "../models/Job.js";
import DLQ from "../models/DLQ.js";
import { getConfig } from "./configService.js";

export const enqueueJob = async (jobData) => {
    const now = new Date();
    const job = await Job.create({
        id: uuidv4(),
        command: jobData.command,
        state: "pending",
        attempts: 0,
        max_retries: jobData.max_retries ?? getConfig().max_retries,
        created_at: now,
        updated_at: now
    });

    return job;
};

export const moveToDLQ = async (job, reason) => {
    await DLQ.create({
        id: job.id,
        command: job.command,
        reason,
        moved_at: new Date()
    });
    await Job.deleteOne({ id: job.id });
};

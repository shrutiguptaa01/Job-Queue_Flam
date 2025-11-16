import { connectDB } from "../db/mongo.js";
import { startWorker } from "../services/workerService.js";

const workers = parseInt(process.argv[2] ?? 1);

const run = async () => {
    await connectDB();
    for (let i = 1; i <= workers; i++) {
        startWorker(i);
    }
};

run();

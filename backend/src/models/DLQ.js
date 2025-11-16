import mongoose from "mongoose";

const dlqSchema = new mongoose.Schema({
    id: String,
    command: String,
    reason: String,
    moved_at: Date
});

export default mongoose.model("DLQ", dlqSchema);

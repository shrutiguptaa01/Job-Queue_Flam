import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },     // your UUID
    command: String,
    state: { type: String, default: "pending" },
    attempts: { type: Number, default: 0 },
    max_retries: Number,
    created_at: Date,
    updated_at: Date
  },
  { versionKey: false }
);

export default mongoose.model("Job", jobSchema);

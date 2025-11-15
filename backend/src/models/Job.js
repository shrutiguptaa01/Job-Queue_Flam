// src/models/Job.js
const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema({
  _id: { type: String }, // job id provided or uuid
  command: { type: String, required: true },
  state: { type: String, enum: ["pending", "processing", "completed", "failed", "dead"], default: "pending" },
  attempts: { type: Number, default: 0 },
  max_retries: { type: Number, default: null }, // if null -> use global
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
  runAt: { type: Date, default: () => new Date(0) }, // when job becomes available
  lastError: { type: String, default: null }
}, { versionKey: false });

JobSchema.index({ state: 1, runAt: 1, createdAt: 1 });

module.exports = mongoose.model("Job", JobSchema);

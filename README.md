# Job-Queue_Flam

# QueueCTL - Node.js CLI Job Queue System

## Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [CLI Usage Examples](#cli-usage-examples)
- [Architecture Overview](#architecture-overview)
- [Assumptions Trade-offs](#assumptions-tradeoff)
- [Testing Instructions](#testing-instructions)

---

## Overview

**QueueCTL** is a CLI-based background job queue system built in Node.js with MongoDB.  

It enables:
- Persistent background job storage
- Execution with multiple worker processes
- Automatic retries with exponential backoff
- Dead Letter Queue (DLQ) for permanently failed jobs
- Full CLI interface for monitoring, management, and configuration

This tool is designed to be production-grade yet simple, ideal for background job management in server-side applications.

## Tech Stack
- **Programming Language:** Node.js (v20+)
- **Database:** MongoDB (localhost)
- **CLI Tool:** 
- **Other Packages:** `chalk`, `uuid`, `child_process`, `mongoose`
## Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally 

### Install Dependencies

git clone <https://github.com/shrutiguptaa01/Job-Queue_Flam>
```
cd backend
npm install
```
## CLI Usage Examples
  1.Enqueue a Job 
  ```bash
  queuectl enqueue '{ "command": "echo hello world" }'
    Output: MongoDB Connected
     ✔ Job added: 1a3c01df-fd75-4e84-bc02-b60aa8c8af4
```
2.Start Wrokers
```bash
queuectl worker:start --count 2
     Output: MongoDB Connected
             Worker 1 started
             Worker 2 started
             Worker 2 executing job 1a3c01df-fd75-4e84-bc02-b60aa8c8af4f
```
3.Status
```bash
queuectl status
   Output: MongoDB Connected
           Pending: 2
           Processing: 14
           Completed: 15
           Failed: 1
           DLQ:1

```
4.  List Jobs
```bash
queuectl list
    Output: MongoDB Connected
[
  {
    command: "echo 'Hello World'",
    state: 'processing',
    attempts: 0,
    max_retries: null,
    runAt: 1970-01-01T00:00:00.000Z,
    lastError: null,
    createdAt: 2025-11-15T18:06:12.874Z,
    updatedAt: 2025-11-15T18:06:12.874Z,
    updated_at: 2025-11-16T07:21:48.903Z
  },
]
```
##  Architecture Overview
### Job Lifecycle

| Stage              | Description                                                   |
|--------------------|---------------------------------------------------------------|
| Job Submission     | User submits a job via CLI; job is created with PENDING.     |
| Queueing           | Job is stored in the database; workers poll for PENDING jobs.|
| Processing         | Worker locks the job, marks IN_PROGRESS, and executes it.    |
| Completion/Failure | Success → COMPLETED; Failure → FAILED with error logs.       |
| Retrieval          | User checks job status and result using CLI commands.        |


### Data Persistence
| Component      | Purpose                                          |
|----------------|--------------------------------------------------|
| Jobs Table     | Stores job metadata (ID, payload, status, etc.). |
| Queue Workflow | Maintains job state transitions.                 |
| Logs           | Stores worker execution logs and error traces.   |


### Job Tble Structure:

| Field       | Type        | Description                               |
|-------------|-------------|-------------------------------------------|
| job_id      | UUID/String | Unique job identifier                     |
| status      | Enum        | PENDING / IN_PROGRESS / FAILED / COMPLETED|
| payload     | JSON        | Job input data                            |
| result      | JSON/Text   | Output after job execution                |
| error_log   | Text        | Error trace if the job fails              |
| created_at  | Timestamp   | When the job was created                  |
| updated_at  | Timestamp   | When the job was last updated             |



### Worker Logic

| Step        | Action                                           |
|-------------|--------------------------------------------------|
| Fetch Job   | Worker picks the oldest PENDING job with locking |
| Execute     | Runs the job handler safely                      |
| Update      | Marks as COMPLETED or FAILED                     |
| Store       | Saves result or error trace to DB                |
| Loop        | Worker sleeps briefly and repeats                |

## Assumptions & Trade-offs
### Assumptions

a. Jobs are independent and do not rely on each other.

b. Worker runs as a separate Node.js process (child process / PM2 / Node Worker Threads).

c. Database supports basic locking or conditional updates to avoid double execution.

d. Payloads are small JSON objects that can be stored in the DB without performance issues.

e. Node.js async tasks (Promises / async-await) are used for job execution.

f. System assumes predictable worker polling intervals (e.g., every 200–500 ms).


### Trade-offs

a. Using DB-based queue instead of Redis/RabbitMQ makes setup simple but reduces scalability.

b. Poll-based worker loop is easy to implement but adds a small delay before picking jobs.

c. Storing output/error logs in the DB makes debugging easier but grows storage size quickly.

d. No built-in retry mechanism keeps system simple but requires manual job re-run after failure.

e. Single worker reduces complexity; multi-worker setup may cause race conditions without DB locking.

## Testing Instructions 
### Automated Testing

You should test:

  1.  Job creation → correctly saved with PENDING.

  2.  Worker picks job and sets IN_PROGRESS.

  3.  Worker completes async job correctly → COMPLETED with stored result.

  4.  Worker handles exceptions → sets FAILED and stores error stack.

  5.  Job status retrieval returns accurate info (CLI/API).

  6.  Ensure that no job is executed twice (DB conditional update test).

Run with:
```bash
npm link
```
Manual CLI/API Testing

1. Enqueue a job
```bash
queuectl enqueue '{ "command": "echo hello world" }'
```

2.Start Wrokers
```bash
queuectl worker:start --count 2
```
3. Check job status
```bash
queuectl status
```
4.. Check all jobs
```
queuectl list
```


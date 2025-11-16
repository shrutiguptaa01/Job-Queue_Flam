# Job-Queue_Flam

# QueueCTL - Node.js CLI Job Queue System

## Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [CLI Usage Examples](#cli-usage-examples)
- [Job Lifecycle](#job-lifecycle)
- [Configuration Management](#configuration-management)
- [Testing Instructions](#testing-instructions)
- [Architecture Overview](#architecture-overview)

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
## 1. Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally 

### Install Dependencies
    ```bash
git clone <https://github.com/shrutiguptaa01/Job-Queue_Flam>
cd backend
npm install

## Usuage Examples
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

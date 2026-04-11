# KUET OJ Remote Judge Setup

This document covers the full automated judging setup that now exists in KUET OJ.

## What Was Implemented

The KUET OJ API now has a database-backed judge queue. New submissions are inserted as `pending`, then a background dispatcher in `apps/kuetoj-api` polls the database and claims them for judging. Each claimed job is sent to the separate judge machine over SSH, where `apps/kuetoj-judge-agent/runner.js` uses `isolate` to compile and run the solution with:

- time limit enforcement
- memory limit enforcement
- output file size limiting
- network isolation through `isolate`'s default network namespace behavior
- sample and hidden testcase execution
- output comparison that ignores trailing spaces and trailing blank lines

If the judge machine is temporarily unavailable, the submission is re-queued automatically. After repeated infrastructure failures, the submission moves to `manual_review` instead of receiving a fake wrong answer.

## Files Added For This

- `apps/kuetoj-api/src/modules/contests/judge-dispatch.service.ts`
- `apps/kuetoj-api/src/modules/contests/judge-remote.service.ts`
- `apps/kuetoj-api/src/modules/contests/judge.types.ts`
- `apps/kuetoj-judge-agent/runner.js`
- `apps/kuetoj-api/JUDGE_SERVER_SETUP.md`

## Architecture

1. Participant submits code to KUET OJ.
2. The submission is stored in Postgres with `submissionStatus = pending`.
3. The API worker loop polls the database every `JUDGE_POLL_INTERVAL_MS`.
4. The worker atomically claims one pending submission and marks it `judging`.
5. The API writes a job JSON file and uploads it to the judge PC over SSH/SCP.
6. The judge PC runs `runner.js`, which:
   - creates an `isolate` box
   - compiles when the language needs compilation
   - runs against test cases
   - compares normalized output
   - prints a JSON result to stdout
7. The API reads that JSON and updates the submission verdict, time, memory, score, compile log, and testcase summary.

This is intentionally polling-based. There is no Redis or RabbitMQ in this first version.

## Supported Languages

The remote runner currently supports:

- `c`
- `cpp`
- `java`
- `python3`
- `python` as an alias to `python3`
- `javascript`
- `typescript`

If `typescript` is not needed for contests, do not install `tsc` on the judge machine and simply avoid that language in problem use.

## Important Current Behavior

- A submission must have a language. If the frontend sends a file upload without a language, the API tries to infer the language from file extension.
- Problems must have test cases in `sampleTestCases` and/or `hiddenTestCases`.
- Problems with no testcases are not auto-judged and will eventually land in `manual_review`.
- Manual grading still exists as a fallback override for judges.

## Server Roles

You need two machines:

- API/Web server: runs KUET OJ API and web UI
- Judge server: runs `isolate`, compilers/interpreters, and the remote runner

The API server must be able to SSH into the judge server using a non-interactive key.

## Step 1: Prepare The Judge Server

These instructions assume Ubuntu/Debian on the judge PC.

Create a dedicated user:

```bash
sudo adduser --disabled-password --gecos "" judge
sudo usermod -aG sudo judge
```

Install general tooling:

```bash
sudo apt update
sudo apt install -y build-essential gcc g++ openjdk-17-jdk python3 nodejs npm pkg-config libcap-dev libsystemd-dev rsync curl
```

Optional, only if you want TypeScript judging:

```bash
sudo npm install -g typescript
```

## Step 2: Install Isolate On The Judge Server

Recommended approach: use the official `isolate` package source when available, or build from source if you prefer.

### Option A: Install The Official Debian/Ubuntu Package

According to the official `ioi/isolate` repository, packages are provided for Debian stable and recent Ubuntu LTS releases:

```bash
sudo mkdir -p /etc/apt/keyrings
curl https://www.ucw.cz/isolate/debian/signing-key.asc | sudo tee /etc/apt/keyrings/isolate.asc >/dev/null
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/isolate.asc] http://www.ucw.cz/isolate/debian/ bookworm-isolate main" | sudo tee /etc/apt/sources.list.d/isolate.list
sudo apt update
sudo apt install -y isolate
```

If your distro codename differs, adjust the repository entry accordingly.

### Option B: Build Isolate From Source

```bash
cd /tmp
git clone https://github.com/ioi/isolate.git
cd isolate
make
sudo make install
```

If you want the cgroup keeper service too:

```bash
make isolate-cg-keeper
sudo make install
```

## Step 3: Enable CGroup Support For Isolate

The official `isolate` manual recommends cgroup v2 for robust process and memory accounting. It also notes that with systemd you should run `isolate.service` so `isolate.scope` is delegated correctly.

Enable the service if your installation provides it:

```bash
sudo systemctl enable --now isolate
sudo systemctl status isolate
```

Check the environment:

```bash
isolate --check-config
isolate --print-cg-root
```

If your install includes `isolate-check-environment`, run it too:

```bash
sudo isolate-check-environment
```

## Step 4: Create The Judge Runner Directory

On the judge server:

```bash
sudo mkdir -p /opt/kuetoj-judge/jobs
sudo chown -R judge:judge /opt/kuetoj-judge
```

From your API server or local machine, copy the runner:

```bash
scp apps/kuetoj-judge-agent/runner.js judge@JUDGE_SERVER_IP:/opt/kuetoj-judge/runner.js
ssh judge@JUDGE_SERVER_IP "chmod +x /opt/kuetoj-judge/runner.js"
```

## Step 5: Set Up Passwordless SSH From API Server To Judge Server

On the API server, generate a key if you do not already have one:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "kuetoj-judge"
```

Copy the public key to the judge server:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub judge@JUDGE_SERVER_IP
```

Test passwordless login:

```bash
ssh judge@JUDGE_SERVER_IP "node -v"
ssh judge@JUDGE_SERVER_IP "ls -la /opt/kuetoj-judge"
```

If you want stricter host verification, keep `JUDGE_SSH_STRICT_HOST_KEY_CHECKING=true` and manually connect once so the host key is recorded:

```bash
ssh judge@JUDGE_SERVER_IP
```

## Step 6: Configure KUET OJ API

Update `apps/kuetoj-api/.env` on the API server:

```env
JUDGE_ENABLED=true
JUDGE_SERVER_NAME=judge-pc-1
JUDGE_POLL_INTERVAL_MS=3000
JUDGE_MAX_CONCURRENT_JOBS=1
JUDGE_MAX_RETRY_COUNT=3
JUDGE_CLAIM_STALE_MS=900000
JUDGE_SSH_HOST=JUDGE_SERVER_IP
JUDGE_SSH_PORT=22
JUDGE_SSH_USER=judge
JUDGE_SSH_PRIVATE_KEY_PATH=/home/your-api-user/.ssh/id_ed25519
JUDGE_SSH_STRICT_HOST_KEY_CHECKING=true
JUDGE_SSH_CONNECT_TIMEOUT_MS=10000
JUDGE_REMOTE_EXEC_TIMEOUT_MS=600000
JUDGE_REMOTE_NODE_BIN=node
JUDGE_REMOTE_RUNNER_PATH=/opt/kuetoj-judge/runner.js
JUDGE_REMOTE_JOBS_DIR=/opt/kuetoj-judge/jobs
```

## Step 7: Restart KUET OJ API

Restart the API so:

- the new database columns are synchronized
- the judge dispatcher loop starts

Development mode:

```bash
npm run dev:kuetoj-api
```

Production build:

```bash
npm run build:kuetoj-api
cd apps/kuetoj-api
npm run start:prod
```

When the API starts with `JUDGE_ENABLED=true`, it should log that the remote judge dispatcher has started.

## Step 8: Verify End-To-End

1. Create or edit a problem and make sure it has sample and/or hidden testcases.
2. Start a contest containing that problem.
3. Submit a simple accepted solution.
4. Confirm the submission changes from `pending` to `judging` and then to `accepted`.
5. Submit a wrong solution and confirm it becomes `wrong_answer`.
6. Submit an infinite loop and confirm `time_limit_exceeded`.
7. Submit a memory-heavy solution and confirm `memory_limit_exceeded`.
8. Submit broken code and confirm `compilation_error`.

The participant submission detail page now shows:

- compile output
- judge queue/infrastructure errors
- judge message
- testcase summary
- time and memory

## Step 9: Recommended Judge Machine Hardening

These are recommended for more stable measurements:

- disable swap if possible
- use a dedicated machine for judging only
- use performance CPU governor
- avoid Docker/VM nesting for the judge if you want stable timing
- do not run unrelated heavy workloads on the judge PC during contests

The official `isolate` manual also recommends cgroup v2 and notes that running inside containers is generally not recommended for reliable contest judging.

## Step 10: Contest Authoring Rules For Your Team

To avoid confusing verdicts, follow these rules:

- always set `timeLimitMs`
- always set `memoryLimitKb`
- always provide at least one hidden testcase
- do not depend on uploaded `inputFile`/`outputFile` for judging yet; this implementation uses structured testcase arrays
- choose languages that are actually installed on the judge server

## Troubleshooting

### Submission stays on `pending`

Check:

- `JUDGE_ENABLED=true`
- API logs say the dispatcher started
- SSH from API server to judge server works without password
- the problem has at least one testcase

### Submission goes to `manual_review`

That means the remote judging infrastructure failed repeatedly. Check:

- `ssh judge@HOST "node /opt/kuetoj-judge/runner.js --job /opt/kuetoj-judge/jobs/test.json"` with a real test file
- `isolate --check-config`
- `systemctl status isolate`
- whether compilers/interpreters exist on the judge server

### `memory_limit_exceeded` is not detected reliably

Confirm:

- cgroup v2 is active
- `isolate.service` is running
- the kernel and distro support memory accounting properly

### Java or TypeScript submissions fail to compile

Check:

- `javac -version`
- `java -version`
- `tsc -v` if TypeScript is enabled

## Deployment Checklist

- API server can SSH into judge server without password
- judge server has `isolate` working
- judge server has compilers/interpreters installed
- `runner.js` exists at `/opt/kuetoj-judge/runner.js`
- KUET OJ API `.env` contains judge SSH settings
- problems contain structured testcases
- API restarted after configuration

## Official References

- Isolate manual page: https://www.ucw.cz/isolate/isolate.1.html
- Official isolate repository: https://github.com/ioi/isolate

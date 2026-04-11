# KUET OJ Judge Agent

This package is the remote judge runner for KUET OJ. The main API sends one job file over SSH, then invokes `runner.js` on the judge machine. The runner:

- initializes an `isolate` sandbox
- compiles the submission when needed
- runs it against sample and hidden tests
- compares outputs while ignoring trailing spaces
- enforces time, memory, output-size, and no-network constraints
- prints a single JSON result back to the API

The full setup flow lives in [`apps/kuetoj-api/JUDGE_SERVER_SETUP.md`](../kuetoj-api/JUDGE_SERVER_SETUP.md).

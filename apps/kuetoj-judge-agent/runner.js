#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const VERDICTS = {
  ACCEPTED: 'accepted',
  WRONG_ANSWER: 'wrong_answer',
  TIME_LIMIT_EXCEEDED: 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded',
  RUNTIME_ERROR: 'runtime_error',
  COMPILATION_ERROR: 'compilation_error',
};

const ISOLATE_BIN = process.env.ISOLATE_BIN || 'isolate';
const JUDGE_WORK_ROOT = process.env.JUDGE_WORK_ROOT || '/opt/kuetoj-judge';
const BOX_ID_MIN = Number.parseInt(process.env.JUDGE_BOX_ID_MIN || '0', 10);
const BOX_ID_MAX = Number.parseInt(process.env.JUDGE_BOX_ID_MAX || '63', 10);
const USE_CGROUPS = process.env.JUDGE_USE_CGROUPS !== 'false';
const COMPILE_TIMEOUT_SEC = Number.parseFloat(
  process.env.JUDGE_COMPILE_TIMEOUT_SEC || '20',
);
const COMPILE_WALL_TIMEOUT_SEC = Number.parseFloat(
  process.env.JUDGE_COMPILE_WALL_TIMEOUT_SEC || '30',
);
const RUN_EXTRA_TIME_SEC = Number.parseFloat(
  process.env.JUDGE_RUN_EXTRA_TIME_SEC || '0.25',
);
const OUTPUT_LIMIT_KB = Number.parseInt(
  process.env.JUDGE_OUTPUT_LIMIT_KB || '1024',
  10,
);
const PROCESS_LIMIT = Number.parseInt(
  process.env.JUDGE_PROCESS_LIMIT || '32',
  10,
);
const SANDBOX_PATH =
  process.env.JUDGE_SANDBOX_PATH ||
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function getToolPath(envKey, fallbackPath) {
  return process.env[envKey] || fallbackPath;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--job') {
      args.job = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function ensureDir(targetPath) {
  await fsp.mkdir(targetPath, { recursive: true });
}

async function acquireBoxLock() {
  const lockRoot = path.join(JUDGE_WORK_ROOT, 'locks');
  await ensureDir(lockRoot);

  for (let boxId = BOX_ID_MIN; boxId <= BOX_ID_MAX; boxId += 1) {
    const lockPath = path.join(lockRoot, `box-${boxId}.lock`);
    try {
      await fsp.mkdir(lockPath);
      return {
        boxId,
        async release() {
          await fsp.rm(lockPath, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new Error('No free isolate box is currently available');
}

async function initBox(boxId) {
  const args = [];
  if (USE_CGROUPS) args.push('--cg');
  args.push('--box-id', String(boxId), '--init');
  const result = await runCommand(ISOLATE_BIN, args);
  if (result.code !== 0) {
    throw new Error(
      `isolate --init failed for box ${boxId}: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim().split('\n').filter(Boolean).pop();
}

async function cleanupBox(boxId) {
  const args = [];
  if (USE_CGROUPS) args.push('--cg');
  args.push('--box-id', String(boxId), '--cleanup');
  await runCommand(ISOLATE_BIN, args);
}

function parseMeta(content) {
  const meta = {};
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    meta[key] = value;
  }
  return meta;
}

function normalizeOutput(output) {
  return `${output ?? ''}`
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function outputsMatch(actual, expected) {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

function truncateMessage(message, maxLength = 4000) {
  const normalized = `${message ?? ''}`.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function secondsToMs(value) {
  const numeric = Number.parseFloat(`${value ?? ''}`);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric * 1000));
}

function getMemoryFromMeta(meta) {
  const value = Number.parseInt(meta['cg-mem'] || meta['max-rss'] || '', 10);
  return Number.isFinite(value) ? value : null;
}

function getLanguageSpec(language, memoryLimitKb) {
  const javaHeapMb = Math.max(64, Math.floor(memoryLimitKb / 1024 / 1.5));
  const gccBin = getToolPath('JUDGE_GCC_BIN', '/usr/bin/gcc');
  const gppBin = getToolPath('JUDGE_GPP_BIN', '/usr/bin/g++');
  const javacBin = getToolPath('JUDGE_JAVAC_BIN', '/usr/bin/javac');
  const javaBin = getToolPath('JUDGE_JAVA_BIN', '/usr/bin/java');
  const python3Bin = getToolPath('JUDGE_PYTHON3_BIN', '/usr/bin/python3');
  const nodeBin = getToolPath('JUDGE_NODE_BIN', '/usr/bin/node');
  const tscBin = getToolPath('JUDGE_TSC_BIN', '/usr/bin/tsc');

  switch (language) {
    case 'c':
      return {
        sourceFile: 'main.c',
        compile: [gccBin, 'main.c', '-O2', '-std=c17', '-pipe', '-o', 'main'],
        run: ['./main'],
      };
    case 'cpp':
      return {
        sourceFile: 'main.cpp',
        compile: [
          gppBin,
          'main.cpp',
          '-O2',
          '-std=gnu++17',
          '-pipe',
          '-o',
          'main',
        ],
        run: ['./main'],
      };
    case 'java':
      return {
        sourceFile: 'Main.java',
        compile: [javacBin, 'Main.java'],
        run: [javaBin, `-Xms64m`, `-Xmx${javaHeapMb}m`, '-cp', '/box', 'Main'],
      };
    case 'python':
    case 'python3':
      return {
        sourceFile: 'main.py',
        compile: null,
        run: [python3Bin, 'main.py'],
      };
    case 'javascript':
      return {
        sourceFile: 'main.js',
        compile: null,
        run: [nodeBin, 'main.js'],
      };
    case 'typescript':
      return {
        sourceFile: 'main.ts',
        compile: [
          tscBin,
          'main.ts',
          '--target',
          'ES2020',
          '--module',
          'commonjs',
          '--outDir',
          '.',
        ],
        run: [nodeBin, 'main.js'],
      };
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

async function runInIsolate(boxId, boxPath, config) {
  const args = [];
  if (USE_CGROUPS) args.push('--cg');
  args.push('--box-id', String(boxId));
  args.push('--meta', config.metaFile);
  args.push('--silent');
  args.push('--chdir', '/box');
  args.push(`--env=PATH=${SANDBOX_PATH}`);
  args.push('--time', String(config.timeSec));
  args.push('--wall-time', String(config.wallTimeSec));
  args.push('--extra-time', String(config.extraTimeSec ?? RUN_EXTRA_TIME_SEC));
  args.push('--mem', String(config.memoryLimitKb));
  if (USE_CGROUPS) {
    args.push('--cg-mem', String(config.memoryLimitKb));
  }
  args.push(`--processes=${String(config.processLimit ?? PROCESS_LIMIT)}`);
  args.push('--fsize', String(config.outputLimitKb ?? OUTPUT_LIMIT_KB));

  if (config.stdinFile) args.push('--stdin', config.stdinFile);
  if (config.stdoutFile) args.push('--stdout', config.stdoutFile);
  if (config.stderrFile) args.push('--stderr', config.stderrFile);

  args.push('--run', '--', ...config.command);

  return runCommand(ISOLATE_BIN, args, { cwd: boxPath });
}

async function compileSubmission(boxId, boxPath, languageSpec, memoryLimitKb) {
  if (!languageSpec.compile) {
    return {
      verdict: null,
      compileOutput: null,
    };
  }

  const metaFile = path.join(boxPath, 'compile.meta');
  const stdoutFile = path.join(boxPath, 'compile.stdout');
  const stderrFile = path.join(boxPath, 'compile.stderr');

  const result = await runInIsolate(boxId, boxPath, {
    metaFile,
    stdoutFile: path.basename(stdoutFile),
    stderrFile: path.basename(stderrFile),
    timeSec: COMPILE_TIMEOUT_SEC,
    wallTimeSec: COMPILE_WALL_TIMEOUT_SEC,
    extraTimeSec: 0,
    memoryLimitKb: Math.max(memoryLimitKb, 524288),
    processLimit: PROCESS_LIMIT,
    command: languageSpec.compile,
  });

  if (result.code > 1) {
    throw new Error(
      `isolate compilation failed: ${result.stderr || result.stdout || 'unknown error'}`,
    );
  }

  const compileStdout = fs.existsSync(stdoutFile)
    ? await fsp.readFile(stdoutFile, 'utf8')
    : '';
  const compileStderr = fs.existsSync(stderrFile)
    ? await fsp.readFile(stderrFile, 'utf8')
    : '';
  const compileMeta = fs.existsSync(metaFile)
    ? parseMeta(await fsp.readFile(metaFile, 'utf8'))
    : {};

  const combinedOutput = truncateMessage(
    [compileStdout, compileStderr].filter(Boolean).join('\n'),
  );

  if (result.code !== 0 || compileMeta.status) {
    return {
      verdict: VERDICTS.COMPILATION_ERROR,
      compileOutput:
        combinedOutput ||
        truncateMessage(compileMeta.message || 'Compilation failed'),
    };
  }

  return {
    verdict: null,
    compileOutput: combinedOutput || null,
  };
}

async function runSingleTestCase(boxId, boxPath, languageSpec, problem, testCase) {
  const inputFile = path.join(boxPath, 'input.txt');
  const stdoutFile = path.join(boxPath, 'stdout.txt');
  const stderrFile = path.join(boxPath, 'stderr.txt');
  const metaFile = path.join(boxPath, 'run.meta');

  await fsp.writeFile(inputFile, testCase.input || '', 'utf8');

  const timeSec = Math.max(0.05, (problem.timeLimitMs || 1000) / 1000);
  const wallTimeSec = Math.max(timeSec * 2.5, timeSec + 1);

  const result = await runInIsolate(boxId, boxPath, {
    metaFile,
    stdinFile: path.basename(inputFile),
    stdoutFile: path.basename(stdoutFile),
    stderrFile: path.basename(stderrFile),
    timeSec,
    wallTimeSec,
    memoryLimitKb: problem.memoryLimitKb || 262144,
    processLimit: PROCESS_LIMIT,
    outputLimitKb: OUTPUT_LIMIT_KB,
    command: languageSpec.run,
  });

  if (result.code > 1) {
    throw new Error(
      `isolate execution failed: ${result.stderr || result.stdout || 'unknown error'}`,
    );
  }

  const meta = fs.existsSync(metaFile)
    ? parseMeta(await fsp.readFile(metaFile, 'utf8'))
    : {};
  const actualStdout = fs.existsSync(stdoutFile)
    ? await fsp.readFile(stdoutFile, 'utf8')
    : '';
  const actualStderr = fs.existsSync(stderrFile)
    ? await fsp.readFile(stderrFile, 'utf8')
    : '';
  const timeMs = secondsToMs(meta.time);
  const memoryKb = getMemoryFromMeta(meta);

  if (meta.status === 'TO') {
    return {
      index: testCase.index,
      isSample: testCase.isSample,
      verdict: VERDICTS.TIME_LIMIT_EXCEEDED,
      timeMs,
      memoryKb,
      message: `Time limit exceeded on ${testCase.isSample ? 'sample' : 'hidden'} test ${testCase.index}`,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(meta, 'cg-oom-killed') ||
    /memory/i.test(meta.message || '')
  ) {
    return {
      index: testCase.index,
      isSample: testCase.isSample,
      verdict: VERDICTS.MEMORY_LIMIT_EXCEEDED,
      timeMs,
      memoryKb,
      message: `Memory limit exceeded on ${testCase.isSample ? 'sample' : 'hidden'} test ${testCase.index}`,
    };
  }

  if (
    meta.status === 'RE' ||
    meta.status === 'SG' ||
    Number.parseInt(meta.exitcode || '0', 10) !== 0
  ) {
    return {
      index: testCase.index,
      isSample: testCase.isSample,
      verdict: VERDICTS.RUNTIME_ERROR,
      timeMs,
      memoryKb,
      message:
        truncateMessage(actualStderr || meta.message || 'Runtime error') ||
        'Runtime error',
    };
  }

  if (!outputsMatch(actualStdout, testCase.output || '')) {
    return {
      index: testCase.index,
      isSample: testCase.isSample,
      verdict: VERDICTS.WRONG_ANSWER,
      timeMs,
      memoryKb,
      message: `${testCase.isSample ? 'Sample' : 'Hidden'} test ${testCase.index} output did not match`,
    };
  }

  return {
    index: testCase.index,
    isSample: testCase.isSample,
    verdict: VERDICTS.ACCEPTED,
    timeMs,
    memoryKb,
    message: null,
  };
}

function buildScore(contestType, maxScore, passedCount, totalCases) {
  if (contestType !== 'score_based') return null;
  const scoreBase = maxScore != null ? Number(maxScore) : 100;
  if (!Number.isFinite(scoreBase) || totalCases <= 0) return 0;
  const rawScore = (scoreBase * passedCount) / totalCases;
  return Math.round(rawScore * 100) / 100;
}

async function evaluateJob(job) {
  const boxLock = await acquireBoxLock();
  let boxPath = null;

  try {
    boxPath = await initBox(boxLock.boxId);
    const workBoxPath = path.join(boxPath, 'box');
    const languageSpec = getLanguageSpec(
      job.language,
      job.problem.memoryLimitKb || 262144,
    );
    const sourcePath = path.join(workBoxPath, languageSpec.sourceFile);
    await fsp.writeFile(sourcePath, job.sourceCode, 'utf8');

    const compileResult = await compileSubmission(
      boxLock.boxId,
      workBoxPath,
      languageSpec,
      job.problem.memoryLimitKb || 262144,
    );

    if (compileResult.verdict) {
      return {
        verdict: compileResult.verdict,
        executionTimeMs: null,
        memoryUsedKb: null,
        score: buildScore(job.contestType, job.maxScore, 0, job.testCases.length),
        judgeMessage: compileResult.compileOutput || 'Compilation failed',
        compileOutput: compileResult.compileOutput,
        testcaseResults: [],
      };
    }

    let passedCount = 0;
    let maxTimeMs = null;
    let maxMemoryKb = null;
    let finalVerdict = VERDICTS.ACCEPTED;
    let finalMessage = null;
    const testcaseResults = [];

    for (const testCase of job.testCases) {
      const caseResult = await runSingleTestCase(
        boxLock.boxId,
        workBoxPath,
        languageSpec,
        job.problem,
        testCase,
      );
      testcaseResults.push(caseResult);

      if (caseResult.verdict === VERDICTS.ACCEPTED) {
        passedCount += 1;
      } else if (finalVerdict === VERDICTS.ACCEPTED) {
        finalVerdict = caseResult.verdict;
        finalMessage = caseResult.message || null;
      }

      if (caseResult.timeMs != null) {
        maxTimeMs =
          maxTimeMs == null ? caseResult.timeMs : Math.max(maxTimeMs, caseResult.timeMs);
      }
      if (caseResult.memoryKb != null) {
        maxMemoryKb =
          maxMemoryKb == null
            ? caseResult.memoryKb
            : Math.max(maxMemoryKb, caseResult.memoryKb);
      }

      if (
        job.contestType !== 'score_based' &&
        caseResult.verdict !== VERDICTS.ACCEPTED
      ) {
        break;
      }
    }

    return {
      verdict: finalVerdict,
      executionTimeMs: maxTimeMs,
      memoryUsedKb: maxMemoryKb,
      score: buildScore(
        job.contestType,
        job.maxScore,
        passedCount,
        job.testCases.length,
      ),
      judgeMessage: finalMessage,
      compileOutput: compileResult.compileOutput,
      testcaseResults,
    };
  } finally {
    if (boxPath) {
      await cleanupBox(boxLock.boxId);
    }
    await boxLock.release();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.job) {
    throw new Error('Usage: runner.js --job /path/to/job.json');
  }

  await ensureDir(JUDGE_WORK_ROOT);
  const job = JSON.parse(await fsp.readFile(args.job, 'utf8'));
  const result = await evaluateJob(job);
  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown judge failure';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

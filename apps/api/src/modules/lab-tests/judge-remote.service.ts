import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { JudgeJobPayload, JudgeResultPayload } from './judge.types';

const execFileAsync = promisify(execFile);

@Injectable()
export class LabJudgeRemoteService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('JUDGE_ENABLED') === 'true';
  }

  private getSshUser(): string {
    return this.config.get<string>('JUDGE_SSH_USER') ?? '';
  }

  private getSshHost(): string {
    return this.config.get<string>('JUDGE_SSH_HOST') ?? '';
  }

  private getRemoteNodeBin(): string {
    return this.config.get<string>('JUDGE_REMOTE_NODE_BIN') ?? 'node';
  }

  private getRemoteRunnerPath(): string {
    return (
      this.config.get<string>('JUDGE_REMOTE_RUNNER_PATH') ??
      '/opt/kuetoj-judge/runner.js'
    );
  }

  private getRemoteJobsDir(): string {
    return (
      this.config.get<string>('JUDGE_REMOTE_JOBS_DIR') ??
      '/opt/kuetoj-judge/jobs'
    );
  }

  private getConnectTimeoutMs(): number {
    return Number(this.config.get<string>('JUDGE_SSH_CONNECT_TIMEOUT_MS')) || 10_000;
  }

  private getExecTimeoutMs(): number {
    return Number(this.config.get<string>('JUDGE_REMOTE_EXEC_TIMEOUT_MS')) || 600_000;
  }

  private isStrictHostKeyCheckingEnabled(): boolean {
    return this.config.get<string>('JUDGE_SSH_STRICT_HOST_KEY_CHECKING') !== 'false';
  }

  private getIdentityFile(): string | null {
    return this.config.get<string>('JUDGE_SSH_PRIVATE_KEY_PATH') ?? null;
  }

  private ensureConfigured() {
    if (!this.getSshUser() || !this.getSshHost()) {
      throw new Error('Judge SSH user/host is not configured');
    }
  }

  private getSshTarget(): string {
    return `${this.getSshUser()}@${this.getSshHost()}`;
  }

  private buildSshOptions(portFlag: '-p' | '-P'): string[] {
    const args: string[] = [
      '-o',
      'BatchMode=yes',
      '-o',
      `ConnectTimeout=${Math.max(1, Math.round(this.getConnectTimeoutMs() / 1000))}`,
    ];

    const port = this.config.get<string>('JUDGE_SSH_PORT');
    if (port) args.push(portFlag, port);

    const identityFile = this.getIdentityFile();
    if (identityFile) args.push('-i', identityFile);

    if (!this.isStrictHostKeyCheckingEnabled()) {
      args.push('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null');
    }

    return args;
  }

  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private async runSshCommand(command: string): Promise<string> {
    const sshArgs = [...this.buildSshOptions('-p'), this.getSshTarget(), command];
    const { stdout } = await execFileAsync('ssh', sshArgs, {
      timeout: this.getExecTimeoutMs(),
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout.trim();
  }

  private async runScpUpload(localFilePath: string, remoteFilePath: string) {
    const scpArgs = [
      ...this.buildSshOptions('-P'),
      localFilePath,
      `${this.getSshTarget()}:${remoteFilePath}`,
    ];
    await execFileAsync('scp', scpArgs, {
      timeout: this.getExecTimeoutMs(),
      maxBuffer: 2 * 1024 * 1024,
    });
  }

  async executeJob(job: JudgeJobPayload): Promise<JudgeResultPayload> {
    this.ensureConfigured();

    const tempDir = await mkdtemp(join(tmpdir(), 'labassist-lab-judge-'));
    const localJobPath = join(tempDir, `${job.submissionId}.json`);
    const remoteJobPath = `${this.getRemoteJobsDir().replace(/\/$/, '')}/${job.submissionId}.json`;

    try {
      await writeFile(localJobPath, JSON.stringify(job), 'utf8');
      await this.runSshCommand(
        `mkdir -p ${this.shellEscape(this.getRemoteJobsDir())}`,
      );
      await this.runScpUpload(localJobPath, remoteJobPath);

      const remoteCommand = [
        this.shellEscape(this.getRemoteNodeBin()),
        this.shellEscape(this.getRemoteRunnerPath()),
        '--job',
        this.shellEscape(remoteJobPath),
      ].join(' ');

      const rawResult = await this.runSshCommand(remoteCommand);
      return JSON.parse(rawResult) as JudgeResultPayload;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown SSH judge failure';
      throw new Error(`Remote judge execution failed: ${message}`);
    } finally {
      try {
        await this.runSshCommand(`rm -f ${this.shellEscape(remoteJobPath)}`);
      } catch {
        // ignore cleanup failures
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

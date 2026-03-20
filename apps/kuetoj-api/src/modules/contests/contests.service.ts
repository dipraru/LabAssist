import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Contest } from './entities/contest.entity';
import { Problem } from './entities/problem.entity';
import { ContestProblem } from './entities/contest-problem.entity';
import { ContestSubmission } from './entities/contest-submission.entity';
import { ContestAnnouncement } from './entities/contest-announcement.entity';
import { ContestClarification, ClarificationStatus } from './entities/contest-clarification.entity';
import { User } from '../users/entities/user.entity';
import { TempJudge } from '../users/entities/temp-judge.entity';
import { TempParticipant } from '../users/entities/temp-participant.entity';
import {
  AddContestProblemDto,
  AskClarificationDto,
  AnswerClarificationDto,
  ContestJudgeResultDto,
  ContestSubmitDto,
  CreateAnnouncementDto,
  CreateContestDto,
  CreateProblemDto,
  CreateTempParticipantsDto,
  GradeContestSubmissionDto,
  UpdateContestDto,
  UpdateProblemDto,
} from './dto/contests.dto';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationType } from '../notifications/entities/notification.entity';
import { CredentialsPdfService } from './credentials-pdf.service';
import {
  ContestStatus, ContestType, ManualVerdict, SubmissionStatus,
} from '../../common/enums';
import { UserRole } from '../../common/enums/role.enum';
import { v4 as uuidv4 } from 'uuid';

// ICPC penalty: 20 min per wrong answer
const ICPC_WRONG_PENALTY = 20;

@Injectable()
export class ContestsService {
  constructor(
    @InjectRepository(Contest) private contestRepo: Repository<Contest>,
    @InjectRepository(Problem) private problemRepo: Repository<Problem>,
    @InjectRepository(ContestProblem) private cpRepo: Repository<ContestProblem>,
    @InjectRepository(ContestSubmission) private subRepo: Repository<ContestSubmission>,
    @InjectRepository(ContestAnnouncement) private announcementRepo: Repository<ContestAnnouncement>,
    @InjectRepository(ContestClarification) private clarRepo: Repository<ContestClarification>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(TempJudge) private tjRepo: Repository<TempJudge>,
    @InjectRepository(TempParticipant) private tpRepo: Repository<TempParticipant>,
    private dataSource: DataSource,
    private storage: StorageService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private credentialsPdf: CredentialsPdfService,
  ) {}

  private contestPhase(startTime: Date, endTime: Date): 'upcoming' | 'running' | 'old' {
    const now = new Date();
    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'old';
    return 'running';
  }

  private formatSubmissionDisplayId(submissionNumber: number | null | undefined): string {
    if (!submissionNumber || submissionNumber < 1) return '1000001';
    return String(1_000_000 + submissionNumber);
  }

  private serializeSubmission(submission: ContestSubmission) {
    return {
      ...submission,
      submissionDisplayId: this.formatSubmissionDisplayId(submission.submissionNumber),
    };
  }

  private async getContestParticipantNameMap(contestId: string): Promise<Map<string, string>> {
    const participants = await this.tpRepo.find({ where: { contestId } });
    return new Map(participants.map((participant) => [participant.userId, participant.fullName]));
  }

  private async getContestProblemMetaMap(
    contestId: string,
  ): Promise<Map<string, { label: string; title: string }>> {
    const contestProblems = await this.cpRepo.find({
      where: { contestId },
      order: { orderIndex: 'ASC' },
    });

    return new Map(
      contestProblems.map((problem, index) => [
        problem.id,
        {
          label: problem.label?.trim() || String.fromCharCode(65 + index),
          title: problem.problem?.title ?? 'Untitled Problem',
        },
      ]),
    );
  }

  private async getJudgeProfileId(judgeUserId: string): Promise<string> {
    const judgeProfile = await this.tjRepo.findOne({ where: { userId: judgeUserId } });
    if (!judgeProfile) {
      throw new ForbiddenException('Temporary judge profile not found');
    }
    return judgeProfile.id;
  }

  private async getLegacyContestIdsByProblemAuthor(judgeUserId: string): Promise<string[]> {
    const rows = await this.cpRepo
      .createQueryBuilder('cp')
      .innerJoin(Problem, 'p', 'p.id = cp.problemId')
      .select('DISTINCT cp.contestId', 'contestId')
      .where('p.authorId = :judgeUserId', { judgeUserId })
      .getRawMany<{ contestId: string }>();

    return rows.map((row) => row.contestId).filter(Boolean);
  }

  private async canJudgeManageContest(
    contestId: string,
    createdById: string | null | undefined,
    judgeUserId: string,
    judgeProfileId: string,
  ): Promise<boolean> {
    if (createdById === judgeProfileId || createdById === judgeUserId) return true;
    if (createdById) return false;

    const legacyContestIds = await this.getLegacyContestIdsByProblemAuthor(judgeUserId);
    return legacyContestIds.includes(contestId);
  }

  private isNumericContestIdentifier(identifier: string): boolean {
    return /^\d{4,}$/.test(identifier);
  }

  private async resolveContestByIdentifier(
    identifier: string,
    relations?: string[],
  ): Promise<Contest | null> {
    if (this.isNumericContestIdentifier(identifier)) {
      return this.contestRepo.findOne({
        where: { contestNumber: Number(identifier) },
        relations,
      });
    }

    return this.contestRepo.findOne({
      where: { id: identifier },
      relations,
    });
  }

  private async resolveContestOrThrow(
    identifier: string,
    relations?: string[],
  ): Promise<Contest> {
    const contest = await this.resolveContestByIdentifier(identifier, relations);
    if (!contest) throw new NotFoundException('Contest not found');
    return contest;
  }

  private async getNextProblemCode(): Promise<string> {
    const last = await this.problemRepo.createQueryBuilder('p')
      .where('p.problemCode IS NOT NULL')
      .orderBy('p.problemCode', 'DESC')
      .getOne();

    const lastNumber = last?.problemCode
      ? Number.parseInt(last.problemCode.replace('KOJ-', ''), 10)
      : 0;
    const nextNumber = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;
    return `KOJ-${String(nextNumber).padStart(5, '0')}`;
  }

  private generatePublicStandingsKey(): string {
    return uuidv4().replace(/-/g, '');
  }

  private async ensureProblemCodes(): Promise<void> {
    const missing = await this.problemRepo.find({
      where: { problemCode: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!missing.length) return;

    for (const problem of missing) {
      problem.problemCode = await this.getNextProblemCode();
      await this.problemRepo.save(problem);
    }
  }

  // ─── PROBLEM BANK ────────────────────────────────────────────────────────────

  async createProblem(dto: CreateProblemDto, judgeUserId: string): Promise<Problem> {
    const problemCode = await this.getNextProblemCode();
    const sampleTestCases = (dto.sampleTestCases ?? []).map((sample) => ({
      input: sample.input,
      output: sample.output,
      note: sample.note ?? sample.explanation,
    }));
    const p = this.problemRepo.create({
      problemCode,
      title: dto.title,
      statement: dto.statement,
      inputDescription: dto.inputDescription ?? null,
      outputDescription: dto.outputDescription ?? null,
      timeLimitMs: dto.timeLimitMs ?? null,
      memoryLimitKb: dto.memoryLimitKb ?? null,
      sampleTestCases,
      hiddenTestCases: dto.hiddenTestCases ?? [],
      authorId: judgeUserId,
    });
    return this.problemRepo.save(p);
  }

  async listMyProblems(judgeUserId: string): Promise<Problem[]> {
    await this.ensureProblemCodes();
    const sortByProblemCode = (left: Problem, right: Problem) => {
      const leftNumber = left.problemCode ? Number.parseInt(left.problemCode.replace('KOJ-', ''), 10) : Number.MAX_SAFE_INTEGER;
      const rightNumber = right.problemCode ? Number.parseInt(right.problemCode.replace('KOJ-', ''), 10) : Number.MAX_SAFE_INTEGER;

      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.title.localeCompare(right.title);
    };

    const mine = await this.problemRepo.find({
      where: { authorId: judgeUserId },
      order: { createdAt: 'DESC' },
    });
    if (mine.length) return [...mine].sort(sortByProblemCode);

    const allProblems = await this.problemRepo.find({ order: { createdAt: 'DESC' } });
    return allProblems.sort(sortByProblemCode);
  }

  async getProblemById(id: string): Promise<Problem> {
    await this.ensureProblemCodes();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const p = isUuid
      ? await this.problemRepo.findOne({ where: [{ id }, { problemCode: id }] })
      : await this.problemRepo.findOneBy({ problemCode: id });
    if (!p) throw new NotFoundException('Problem not found');
    return p;
  }

  async updateProblem(id: string, dto: UpdateProblemDto, judgeUserId: string) {
    const p = await this.getProblemById(id);
    if (p.authorId !== judgeUserId) throw new ForbiddenException();
    p.title = dto.title ?? p.title;
    p.statement = dto.statement ?? p.statement;
    p.inputDescription = dto.inputDescription ?? p.inputDescription;
    p.outputDescription = dto.outputDescription ?? p.outputDescription;
    p.timeLimitMs = dto.timeLimitMs ?? p.timeLimitMs;
    p.memoryLimitKb = dto.memoryLimitKb ?? p.memoryLimitKb;
    if (dto.sampleTestCases) {
      p.sampleTestCases = dto.sampleTestCases.map((sample) => ({
        input: sample.input,
        output: sample.output,
        note: sample.note ?? sample.explanation,
      }));
    }
    if (dto.hiddenTestCases) {
      p.hiddenTestCases = dto.hiddenTestCases;
    }
    return this.problemRepo.save(p);
  }

  async deleteProblem(id: string, judgeUserId: string) {
    const problem = await this.getProblemById(id);
    if (problem.authorId !== judgeUserId) throw new ForbiddenException();

    const usageCount = await this.cpRepo.count({ where: { problemId: id } });
    if (usageCount > 0) {
      throw new BadRequestException('Problem is already used in a contest and cannot be deleted');
    }

    await this.problemRepo.remove(problem);
    return { deleted: true, id };
  }

  async uploadProblemFile(
    problemId: string,
    judgeUserId: string,
    inputFile?: Express.Multer.File,
    outputFile?: Express.Multer.File,
  ) {
    const p = await this.getProblemById(problemId);
    if (p.authorId !== judgeUserId) throw new ForbiddenException();
    if (inputFile) {
      const saved = await this.storage.saveBuffer(inputFile.buffer, `${uuidv4()}_${inputFile.originalname}`, 'problems', 10 * 1024 * 1024);
      p.inputFile = saved.url;
    }
    if (outputFile) {
      const saved = await this.storage.saveBuffer(outputFile.buffer, `${uuidv4()}_${outputFile.originalname}`, 'problems', 10 * 1024 * 1024);
      p.outputFile = saved.url;
    }
    return this.problemRepo.save(p);
  }

  // ─── CONTEST CRUD ────────────────────────────────────────────────────────────

  async createContest(dto: CreateContestDto, judgeUserId: string): Promise<Contest> {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const startTime = new Date(dto.startTime);
    const now = new Date();
    const durationHours = dto.durationHours ?? 0;
    const durationMinutes = dto.durationMinutes ?? 0;
    const durationTotalMinutes = durationHours * 60 + durationMinutes;

    const endTime = dto.endTime
      ? new Date(dto.endTime)
      : new Date(startTime.getTime() + durationTotalMinutes * 60 * 1000);
    const freezeEnabled = dto.freezeEnabled ?? false;
    const manualUnfreeze = dto.manualUnfreeze ?? false;
    const freezeBeforeMinutes = Math.max(0, dto.freezeBeforeMinutes ?? 0);
    const freezeAfterMinutes = Math.max(0, dto.freezeAfterMinutes ?? 0);
    const freezeTime = freezeEnabled
      ? new Date(endTime.getTime() - freezeBeforeMinutes * 60 * 1000)
      : (dto.freezeTime ? new Date(dto.freezeTime) : null);
    const standingUnfreezeTime = freezeEnabled
      ? (manualUnfreeze ? null : new Date(endTime.getTime() + freezeAfterMinutes * 60 * 1000))
      : null;
    const isPublicStanding = dto.standingVisibility === 'public';

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid contest start/end time');
    }
    if (startTime < now) {
      throw new BadRequestException('Start time cannot be before current time');
    }
    if (!dto.endTime && durationTotalMinutes <= 0) {
      throw new BadRequestException('Contest duration must be greater than zero');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }
    if (freezeTime && Number.isNaN(freezeTime.getTime())) {
      throw new BadRequestException('Invalid freeze time');
    }
    if (freezeTime && (freezeTime < startTime || freezeTime > endTime)) {
      throw new BadRequestException('Freeze time must be between start and end time');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const maxContestRow = await qr.manager
        .createQueryBuilder(Contest, 'contest')
        .select('MAX(contest.contestNumber)', 'max')
        .getRawOne<{ max: string | null }>();
      const currentMax = maxContestRow?.max ? Number(maxContestRow.max) : 1000;

      const contest = qr.manager.create(Contest, {
        title: dto.title,
        description: dto.description ?? '',
        type: dto.type,
        startTime,
        endTime,
        freezeTime,
        standingUnfreezeTime,
        createdById: judgeProfileId,
        contestNumber: Number.isFinite(currentMax) ? currentMax + 1 : 1001,
        status: ContestStatus.SCHEDULED,
        isStandingFrozen: freezeEnabled,
        isPublicStanding,
        publicStandingsKey: isPublicStanding ? this.generatePublicStandingsKey() : null,
        freezeBeforeMinutes,
        freezeAfterMinutes: manualUnfreeze ? 0 : freezeAfterMinutes,
      });
      await qr.manager.save(contest);

      if (dto.problems?.length) {
        for (const cp of dto.problems) {
          const exists = await qr.manager.findOneBy(Problem, { id: cp.problemId });
          if (!exists) throw new NotFoundException(`Problem ${cp.problemId} not found`);
          if (exists.authorId !== judgeUserId) {
            throw new ForbiddenException('Contest can include only your own problems');
          }
          const cpEntity = qr.manager.create(ContestProblem, {
            contestId: contest.id,
            problemId: cp.problemId,
            label: cp.label,
            orderIndex: cp.orderIndex,
            score: cp.score ?? null,
          });
          await qr.manager.save(cpEntity);
        }
      }
      await qr.commitTransaction();
      return this.getContestById(contest.id);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async updateContest(contestId: string, dto: UpdateContestDto, judgeUserId: string): Promise<Contest> {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const contest = await this.resolveContestOrThrow(contestId, ['problems']);
    if (!(await this.canJudgeManageContest(contest.id, contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    const phase = this.contestPhase(contest.startTime, contest.endTime);
    if (phase === 'old') {
      throw new BadRequestException('Ended contests cannot be edited');
    }

    const nextStartTime = dto.startTime ? new Date(dto.startTime) : contest.startTime;
    const now = new Date();

    if (Number.isNaN(nextStartTime.getTime())) {
      throw new BadRequestException('Invalid contest start time');
    }

    if (dto.startTime && phase !== 'upcoming') {
      throw new BadRequestException('Start time can only be changed for upcoming contests');
    }

    if (phase === 'upcoming' && nextStartTime < now) {
      throw new BadRequestException('Start time cannot be before current time');
    }

    const existingDurationMinutes = Math.max(
      1,
      Math.round((contest.endTime.getTime() - contest.startTime.getTime()) / 60000),
    );
    const defaultDurationHours = Math.floor(existingDurationMinutes / 60);
    const defaultDurationMinutes = existingDurationMinutes % 60;
    const durationHours = dto.durationHours ?? defaultDurationHours;
    const durationMinutes = dto.durationMinutes ?? defaultDurationMinutes;
    const durationTotalMinutes = durationHours * 60 + durationMinutes;

    const nextEndTime = dto.endTime
      ? new Date(dto.endTime)
      : new Date(nextStartTime.getTime() + durationTotalMinutes * 60 * 1000);

    if (Number.isNaN(nextEndTime.getTime())) {
      throw new BadRequestException('Invalid contest end time');
    }
    if (durationTotalMinutes <= 0) {
      throw new BadRequestException('Contest duration must be greater than zero');
    }
    if (nextEndTime <= nextStartTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const freezeEnabled = dto.freezeEnabled ?? contest.isStandingFrozen;
    const currentManualUnfreeze = contest.isStandingFrozen && !contest.standingUnfreezeTime;
    const manualUnfreeze = dto.manualUnfreeze ?? currentManualUnfreeze;
    const freezeBeforeMinutes = Math.max(0, dto.freezeBeforeMinutes ?? contest.freezeBeforeMinutes ?? 0);
    const freezeAfterMinutes = Math.max(0, dto.freezeAfterMinutes ?? contest.freezeAfterMinutes ?? 0);
    const nextFreezeTime = freezeEnabled
      ? new Date(nextEndTime.getTime() - freezeBeforeMinutes * 60 * 1000)
      : null;
    const nextStandingUnfreezeTime = freezeEnabled
      ? (manualUnfreeze ? null : new Date(nextEndTime.getTime() + freezeAfterMinutes * 60 * 1000))
      : null;

    if (nextFreezeTime && (nextFreezeTime < nextStartTime || nextFreezeTime > nextEndTime)) {
      throw new BadRequestException('Freeze time must be between start and end time');
    }

    const isPublicStanding = dto.standingVisibility
      ? dto.standingVisibility === 'public'
      : contest.isPublicStanding;

    const nextTitle = dto.title ?? contest.title;
    const nextDescription = dto.description ?? contest.description;
    const nextType = dto.type ?? contest.type;
    let nextPublicStandingsKey = contest.publicStandingsKey;
    if (isPublicStanding && !nextPublicStandingsKey) {
      nextPublicStandingsKey = this.generatePublicStandingsKey();
    }
    if (!isPublicStanding) {
      nextPublicStandingsKey = null;
    }

    if (dto.problems) {
      const uniqueProblemIds = new Set<string>();
      for (const item of dto.problems) {
        if (uniqueProblemIds.has(item.problemId)) {
          throw new BadRequestException('Duplicate problems are not allowed in a contest');
        }
        uniqueProblemIds.add(item.problemId);
      }
      for (const cp of dto.problems) {
        const exists = await this.problemRepo.findOneBy({ id: cp.problemId });
        if (!exists) throw new NotFoundException(`Problem ${cp.problemId} not found`);
        if (exists.authorId !== judgeUserId) {
          throw new ForbiddenException('Contest can include only your own problems');
        }
      }

      await this.cpRepo.delete({ contestId: contest.id });

      for (let index = 0; index < dto.problems.length; index += 1) {
        const cp = dto.problems[index];
        const entry = this.cpRepo.create({
          contestId: contest.id,
          problemId: cp.problemId,
          label: String.fromCharCode(65 + index),
          orderIndex: index,
          score: cp.score ?? null,
        });
        await this.cpRepo.save(entry);
      }
    }

    await this.contestRepo.update(contest.id, {
      title: nextTitle,
      description: nextDescription,
      type: nextType,
      startTime: nextStartTime,
      endTime: nextEndTime,
      isStandingFrozen: freezeEnabled,
      freezeBeforeMinutes,
      freezeAfterMinutes: manualUnfreeze ? 0 : freezeAfterMinutes,
      freezeTime: nextFreezeTime,
      standingUnfreezeTime: nextStandingUnfreezeTime,
      isPublicStanding,
      publicStandingsKey: nextPublicStandingsKey,
    });
    return this.getContestById(contest.id);
  }

  async getContestById(id: string): Promise<Contest> {
    const c = await this.resolveContestOrThrow(id, ['problems', 'problems.problem']);
    const phase = this.contestPhase(c.startTime, c.endTime);
    c.status = phase === 'upcoming'
      ? ContestStatus.SCHEDULED
      : phase === 'running'
        ? ContestStatus.RUNNING
        : ContestStatus.ENDED;
    return c;
  }

  async getContestByIdForUser(id: string, user: { id: string; role: UserRole }) {
    const contest = await this.getContestById(id);
    if (user.role !== UserRole.TEMP_PARTICIPANT) {
      return contest;
    }

    const phase = this.contestPhase(contest.startTime, contest.endTime);
    if (phase === 'upcoming') {
      return {
        ...contest,
        problems: [],
      };
    }

    return contest;
  }

  async listContests(): Promise<Contest[]> {
    const contests = await this.contestRepo.find({ order: { startTime: 'DESC' } });
    return contests.map((contest) => ({
      ...contest,
      status: this.contestPhase(contest.startTime, contest.endTime) === 'upcoming'
        ? ContestStatus.SCHEDULED
        : this.contestPhase(contest.startTime, contest.endTime) === 'running'
          ? ContestStatus.RUNNING
          : ContestStatus.ENDED,
    }));
  }

  async listMyContests(judgeUserId: string): Promise<Array<Contest & { participatedCount: number }>> {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const contestsByOwner = await this.contestRepo.find({
      where: [{ createdById: judgeProfileId }, { createdById: judgeUserId }],
      order: { startTime: 'DESC' },
    });

    const legacyContestIds = await this.getLegacyContestIdsByProblemAuthor(judgeUserId);
    const legacyContests = legacyContestIds.length
      ? await this.contestRepo.find({
        where: { id: In(legacyContestIds) },
        order: { startTime: 'DESC' },
      })
      : [];

    const uniqueContests = new Map<string, Contest>();
    for (const contest of [...contestsByOwner, ...legacyContests]) {
      uniqueContests.set(contest.id, contest);
    }

    const contests = Array.from(uniqueContests.values()).sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime(),
    );

    const contestIds = contests.map((contest) => contest.id);
    const participatedMap = new Map<string, number>();
    if (contestIds.length) {
      const participatedRows = await this.subRepo
        .createQueryBuilder('submission')
        .select('submission.contestId', 'contestId')
        .addSelect('COUNT(DISTINCT submission.participantId)', 'participatedCount')
        .where('submission.contestId IN (:...contestIds)', { contestIds })
        .groupBy('submission.contestId')
        .getRawMany<{ contestId: string; participatedCount: string }>();

      for (const row of participatedRows) {
        participatedMap.set(row.contestId, Number(row.participatedCount) || 0);
      }
    }

    return contests.map((contest) => ({
      ...contest,
      status: this.contestPhase(contest.startTime, contest.endTime) === 'upcoming'
        ? ContestStatus.SCHEDULED
        : this.contestPhase(contest.startTime, contest.endTime) === 'running'
          ? ContestStatus.RUNNING
          : ContestStatus.ENDED,
      participatedCount: participatedMap.get(contest.id) ?? 0,
    }));
  }

  async updateContestStatus(contestId: string, status: ContestStatus, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    c.status = status;
    return this.contestRepo.save(c);
  }

  async addProblemToContest(contestId: string, dto: AddContestProblemDto, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    if (c.status !== ContestStatus.DRAFT) throw new BadRequestException('Contest already started');

    const cp = this.cpRepo.create({
      contestId: c.id,
      problemId: dto.problemId,
      label: dto.label,
      orderIndex: dto.orderIndex,
      score: dto.score ?? null,
    });
    return this.cpRepo.save(cp);
  }

  // ─── STANDINGS ───────────────────────────────────────────────────────────────

  async getStandings(contestId: string, judgeUserId?: string) {
    const contest = await this.getContestById(contestId);
    const now = new Date();
    const freezeStartReached = !contest.freezeTime || now >= new Date(contest.freezeTime);
    const freezeNotEnded = !contest.standingUnfreezeTime || now < new Date(contest.standingUnfreezeTime);
    const freezeStillActive = contest.isStandingFrozen && freezeStartReached && freezeNotEnded;

    // If standings are frozen, only judge sees live standings
    const showFrozen = freezeStillActive && !judgeUserId;

    const problems = await this.cpRepo.find({
      where: { contestId: contest.id },
      order: { orderIndex: 'ASC' },
    });

    // All accepted/graded submissions
    const subs = await this.subRepo.find({
      where: { contestId: contest.id },
      order: { submittedAt: 'ASC' },
    });
    const participantNameMap = await this.getContestParticipantNameMap(contest.id);

    const cutoff = contest.freezeTime && showFrozen ? new Date(contest.freezeTime) : null;

    // Group by participant
    const participantMap = new Map<string, {
      participantId: string;
      participantName: string;
      solved: number;
      penalty: number;
      scores: number;
      problemStatus: Record<string, { accepted: boolean; tries: number; acceptedAt?: Date; score?: number }>;
    }>();

    for (const sub of subs) {
      // Skip submissions after freeze for public view
      if (cutoff && sub.submittedAt > cutoff) continue;

      if (!participantMap.has(sub.participantId)) {
        participantMap.set(sub.participantId, {
          participantId: sub.participantId,
          participantName: participantNameMap.get(sub.participantId) ?? sub.participantName ?? sub.participantId,
          solved: 0,
          penalty: 0,
          scores: 0,
          problemStatus: {},
        });
      }
      const entry = participantMap.get(sub.participantId)!;
      const pLabel = problems.find(p => p.id === sub.contestProblemId)?.label ?? '?';

      if (!entry.problemStatus[pLabel]) {
        entry.problemStatus[pLabel] = { accepted: false, tries: 0 };
      }
      const ps = entry.problemStatus[pLabel];
      if (ps.accepted) continue; // already accepted

      if (contest.type === ContestType.ICPC) {
        if (sub.manualVerdict === ManualVerdict.ACCEPTED ||
            sub.submissionStatus === SubmissionStatus.ACCEPTED) {
          ps.accepted = true;
          ps.acceptedAt = sub.submittedAt;
          const minutesFromStart =
            Math.floor((sub.submittedAt.getTime() - contest.startTime.getTime()) / 60000);
          entry.solved += 1;
          entry.penalty += minutesFromStart + ps.tries * ICPC_WRONG_PENALTY;
        } else {
          ps.tries += 1;
        }
      } else {
        // score_based
        if (sub.score != null && sub.score > (ps.score ?? 0)) {
          ps.score = sub.score;
          entry.scores = Object.values(entry.problemStatus)
            .reduce((acc, p) => acc + (p.score ?? 0), 0);
        }
      }
    }

    const rows = Array.from(participantMap.values());

    if (contest.type === ContestType.ICPC) {
      rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
    } else {
      rows.sort((a, b) => b.scores - a.scores);
    }

    return {
      contestId,
      type: contest.type,
      isFrozen: freezeStillActive,
      problems: problems.map(p => ({ label: p.label, problemId: p.problemId })),
      rows: rows.map((r, idx) => ({ rank: idx + 1, ...r })),
    };
  }

  async getPublicStandingsByKey(publicStandingsKey: string) {
    const contest = await this.contestRepo.findOne({ where: { publicStandingsKey } });
    if (!contest || !contest.isPublicStanding) {
      throw new NotFoundException('Public standings link not found');
    }
    return this.getStandings(contest.id);
  }

  async getPublicStandingsByContest(identifier: string) {
    const contest = await this.resolveContestOrThrow(identifier);
    if (!contest.isPublicStanding) {
      throw new ForbiddenException('Unauthorized');
    }

    const standings = await this.getStandings(contest.id);
    return {
      ...standings,
      contest: {
        id: contest.id,
        contestNumber: contest.contestNumber,
        title: contest.title,
        type: contest.type,
        startTime: contest.startTime,
        endTime: contest.endTime,
      },
    };
  }

  async freezeStandings(contestId: string, frozen: boolean, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    c.isStandingFrozen = frozen;
    const saved = await this.contestRepo.save(c);
    // Broadcast to all participants
    this.gateway.sendToContest(c.id, 'standings:freeze', { frozen });
    return saved;
  }

  // ─── SUBMISSION ───────────────────────────────────────────────────────────────

  async submitSolution(
    contestId: string,
    dto: ContestSubmitDto,
    participantUserId: string,
    participantName: string,
    file?: Express.Multer.File,
  ) {
    const contest = await this.resolveContestOrThrow(contestId);
    const participantNameMap = await this.getContestParticipantNameMap(contest.id);
    const resolvedParticipantName = participantNameMap.get(participantUserId) ?? participantName;
    const now = new Date();
    const phase = this.contestPhase(contest.startTime, contest.endTime);
    if (phase !== 'running')
      throw new ForbiddenException('Contest is not running');
    if (now < contest.startTime || now > contest.endTime)
      throw new ForbiddenException('Contest window closed');

    const cp = await this.cpRepo.findOneBy({ id: dto.contestProblemId, contestId: contest.id });
    if (!cp) throw new NotFoundException('Problem not in this contest');

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    if (file) {
      if (file.size > 256 * 1024) throw new BadRequestException('File too large (max 256KB)');
      const saved = await this.storage.saveBuffer(
        file.buffer, `${uuidv4()}_${file.originalname}`, 'submissions', 256 * 1024,
      );
      fileUrl = saved.url;
      fileName = file.originalname;
    }
    if (!dto.code && !fileUrl) throw new BadRequestException('Code or file required');

    const sub = this.subRepo.create({
      contestId: contest.id,
      contestProblemId: dto.contestProblemId,
      participantId: participantUserId,
      participantName: resolvedParticipantName,
      code: dto.code ?? null,
      fileUrl,
      fileName,
      language: dto.language ?? null,
      submissionStatus: SubmissionStatus.PENDING,
      judgeToken: uuidv4(),
    });
    const saved = await this.subRepo.save(sub);
    return this.serializeSubmission(saved);
  }

  async getMySubmissions(contestId: string, participantUserId: string) {
    const contest = await this.resolveContestOrThrow(contestId);
    const participantNameMap = await this.getContestParticipantNameMap(contest.id);
    const submissions = await this.subRepo.find({
      where: { contestId: contest.id, participantId: participantUserId },
      order: { submittedAt: 'DESC' },
    });
    return submissions.map((submission) => {
      const fullName = participantNameMap.get(submission.participantId) ?? submission.participantName ?? submission.participantId;
      return this.serializeSubmission({ ...submission, participantName: fullName });
    });
  }

  async getMySubmissionById(contestId: string, submissionId: string, participantUserId: string) {
    const contest = await this.resolveContestOrThrow(contestId);
    const participantNameMap = await this.getContestParticipantNameMap(contest.id);
    const submission = await this.subRepo.findOne({
      where: { id: submissionId, contestId: contest.id, participantId: participantUserId },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    const fullName = participantNameMap.get(submission.participantId) ?? submission.participantName ?? submission.participantId;
    return this.serializeSubmission({ ...submission, participantName: fullName });
  }

  async getAllSubmissions(contestId: string, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    const participantNameMap = await this.getContestParticipantNameMap(c.id);
    const submissions = await this.subRepo.find({
      where: { contestId: c.id },
      order: { submittedAt: 'DESC' },
    });
    return submissions.map((submission) => {
      const fullName = participantNameMap.get(submission.participantId) ?? submission.participantName ?? submission.participantId;
      return this.serializeSubmission({ ...submission, participantName: fullName });
    });
  }

  async gradeSubmission(subId: string, dto: GradeContestSubmissionDto, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const sub = await this.subRepo.findOne({
      where: { id: subId },
      relations: ['contest'],
    });
    if (!sub) throw new NotFoundException();
    if (!(await this.canJudgeManageContest(sub.contest.id, sub.contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    const normalizedVerdict = dto.verdict.toLowerCase().replace(/-/g, '_') as ManualVerdict;
    sub.manualVerdict = normalizedVerdict;
    sub.submissionStatus = SubmissionStatus.MANUAL_REVIEW;
    sub.score = dto.score ?? null;

    // ICPC: compute penalty immediately
    if (sub.contest.type === ContestType.ICPC &&
      normalizedVerdict === ManualVerdict.ACCEPTED) {
      const minutesFromStart =
        Math.floor((new Date().getTime() - sub.contest.startTime.getTime()) / 60000);
      sub.penaltyMinutes = minutesFromStart;
    }

    const saved = await this.subRepo.save(sub);
    // Push live update to contest room
    this.gateway.sendToContest(sub.contestId, 'verdict', {
      submissionId: sub.id,
      contestProblemId: sub.contestProblemId,
      participantId: sub.participantId,
      verdict: sub.manualVerdict,
    });
    return this.serializeSubmission(saved);
  }

  // ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

  async createAnnouncement(
    contestId: string,
    dto: CreateAnnouncementDto,
    authorId: string,
  ) {
    const judgeProfileId = await this.getJudgeProfileId(authorId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, authorId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    const ann = this.announcementRepo.create({
      contestId: c.id,
      authorId,
      title: dto.title,
      body: dto.body,
      isPinned: dto.isPinned ?? false,
    });
    const saved = await this.announcementRepo.save(ann);

    // Real-time push to all in contest room
    this.gateway.sendToContest(c.id, 'announcement', {
      id: saved.id,
      title: saved.title,
      body: saved.body,
      isPinned: saved.isPinned,
      createdAt: saved.createdAt,
    });

    // Also notify enrolled participants via notification system
    const participants = await this.tpRepo.find({ where: { contestId: c.id } });
    if (participants.length) {
      const recipientUserIds = await Promise.all(
        participants.map(async tp => {
          const u = await this.userRepo.findOne({ where: { id: tp.userId } });
          return u?.id;
        })
      );
      const validIds = recipientUserIds.filter(Boolean) as string[];
      if (validIds.length) {
        await this.notifications.createBulk(validIds, {
          type: NotificationType.CONTEST_ANNOUNCEMENT,
          title: `[${c.title}] ${dto.title}`,
          body: dto.body,
          referenceId: c.id,
        });
      }
    }

    return saved;
  }

  async getAnnouncements(contestId: string) {
    const contest = await this.resolveContestOrThrow(contestId);
    return this.announcementRepo.find({
      where: { contestId: contest.id },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── CLARIFICATIONS ───────────────────────────────────────────────────────────

  async askClarification(contestId: string, dto: AskClarificationDto, participantUserId: string) {
    const c = await this.resolveContestOrThrow(contestId);
    const participantNameMap = await this.getContestParticipantNameMap(c.id);
    const participantName = participantNameMap.get(participantUserId) ?? null;

    const clar = this.clarRepo.create({
      contestId: c.id,
      participantId: participantUserId,
      participantName,
      question: dto.question,
      contestProblemId: dto.contestProblemId ?? null,
      status: ClarificationStatus.OPEN,
    });
    return this.clarRepo.save(clar);
  }

  async getPendingClarifications(contestId: string, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    const participantNameMap = await this.getContestParticipantNameMap(c.id);
    const contestProblemMetaMap = await this.getContestProblemMetaMap(c.id);
    const clarifications = await this.clarRepo.find({
      where: { contestId: c.id, status: ClarificationStatus.OPEN },
      order: { createdAt: 'ASC' },
    });
    return clarifications.map((clarification) => ({
      ...clarification,
      contestProblemLabel: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.label ?? null)
        : null,
      contestProblemTitle: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.title ?? null)
        : null,
      participantName: participantNameMap.get(clarification.participantId)
        ?? clarification.participantName
        ?? clarification.participantId,
    }));
  }

  async getAllClarifications(contestId: string, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const c = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(c.id, c.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    const participantNameMap = await this.getContestParticipantNameMap(c.id);
    const contestProblemMetaMap = await this.getContestProblemMetaMap(c.id);
    const clarifications = await this.clarRepo.find({
      where: { contestId: c.id },
      order: { createdAt: 'DESC' },
    });
    return clarifications.map((clarification) => ({
      ...clarification,
      contestProblemLabel: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.label ?? null)
        : null,
      contestProblemTitle: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.title ?? null)
        : null,
      participantName: participantNameMap.get(clarification.participantId)
        ?? clarification.participantName
        ?? clarification.participantId,
    }));
  }

  async answerClarification(
    clarId: string,
    dto: AnswerClarificationDto,
    judgeUserId: string,
  ) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const clar = await this.clarRepo.findOne({
      where: { id: clarId },
      relations: ['contest'],
    });
    if (!clar) throw new NotFoundException();
    if (!(await this.canJudgeManageContest(clar.contest.id, clar.contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    clar.answer = dto.answer;
    clar.status = ClarificationStatus.ANSWERED;
    clar.isBroadcast = dto.isBroadcast ?? false;
    clar.answeredById = judgeUserId;
    const saved = await this.clarRepo.save(clar);

    if (clar.isBroadcast) {
      this.gateway.sendToContest(clar.contestId, 'clarification', {
        id: saved.id,
        question: saved.question,
        answer: saved.answer,
        contestProblemId: saved.contestProblemId,
      });
    } else {
      // Send only to the asker
      this.gateway.sendToUser(clar.participantId, 'clarification', {
        id: saved.id,
        question: saved.question,
        answer: saved.answer,
      });
    }
    return saved;
  }

  async ignoreClarification(clarId: string, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const clar = await this.clarRepo.findOne({
      where: { id: clarId },
      relations: ['contest'],
    });
    if (!clar) throw new NotFoundException();
    if (!(await this.canJudgeManageContest(clar.contest.id, clar.contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    clar.status = ClarificationStatus.CLOSED;
    const saved = await this.clarRepo.save(clar);
    return saved;
  }

  async getMyClarifications(contestId: string, participantUserId: string) {
    const contest = await this.resolveContestOrThrow(contestId);
    const participantNameMap = await this.getContestParticipantNameMap(contest.id);
    const contestProblemMetaMap = await this.getContestProblemMetaMap(contest.id);
    const clarifications = await this.clarRepo.find({
      where: { contestId: contest.id, participantId: participantUserId },
      order: { createdAt: 'DESC' },
    });
    return clarifications.map((clarification) => ({
      ...clarification,
      contestProblemLabel: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.label ?? null)
        : null,
      contestProblemTitle: clarification.contestProblemId
        ? (contestProblemMetaMap.get(clarification.contestProblemId)?.title ?? null)
        : null,
      participantName: participantNameMap.get(clarification.participantId)
        ?? clarification.participantName
        ?? clarification.participantId,
    }));
  }

  // ─── TEMP PARTICIPANTS ────────────────────────────────────────────────────────

  async createTempParticipants(dto: CreateTempParticipantsDto, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const contest = await this.resolveContestOrThrow(dto.contestId);
    if (!(await this.canJudgeManageContest(contest.id, contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }
    const normalizedNames = (dto.names ?? []).map((name) => (typeof name === 'string' ? name.trim() : ''));
    if (!normalizedNames.length || normalizedNames.length > 200) {
      throw new BadRequestException('Participant names must contain between 1 and 200 rows');
    }
    if (normalizedNames.some((name) => !name)) {
      throw new BadRequestException('Participant names contain empty rows');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const results: { username: string; password: string; participantId: string; name: string }[] = [];

      // Find the highest existing TP serial for this contest
      const existing = await qr.manager.find(TempParticipant, { where: { contestId: contest.id } });
      const existingSerials = existing
        .map((participant) => {
          const match = participant.participantId?.match(/(\d+)$/);
          return match ? Number.parseInt(match[1], 10) : 0;
        })
        .filter((value) => Number.isFinite(value));
      let counter = existingSerials.length ? Math.max(...existingSerials) : 0;

      const contestCode = String(contest.contestNumber ?? contest.id.replace(/-/g, '').slice(0, 6)).toUpperCase();

      for (let i = 0; i < normalizedNames.length; i++) {
        counter++;
        const participantId = `TP-${contestCode}-${String(counter).padStart(3, '0')}`;
        const username = `tp_${String(contest.contestNumber ?? contest.id).slice(0, 8)}_${String(counter).padStart(3, '0')}`;
        const plainPassword = Math.random().toString(36).slice(-8).toUpperCase();
        const fullName = normalizedNames[i];

        const user = qr.manager.create(User, {
          username,
          password: plainPassword,
          role: UserRole.TEMP_PARTICIPANT,
          isFirstLogin: false,
          isActive: true,
          expiresAt: null,
        });
        await qr.manager.save(user);

        const tp = qr.manager.create(TempParticipant, {
          participantId,
          fullName,
          contestId: contest.id,
          createdByJudgeId: judgeProfileId,
          userId: user.id,
          loginPassword: plainPassword,
        });
        await qr.manager.save(tp);

        results.push({ username, password: plainPassword, participantId, name: fullName });
      }

      await qr.commitTransaction();
      const credentialsPdfBase64 = await this.credentialsPdf.generateCredentialsPdf(results);
      return {
        participants: results,
        credentialsPdfBase64,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getContestParticipants(contestId: string, judgeUserId: string) {
    const judgeProfileId = await this.getJudgeProfileId(judgeUserId);
    const contest = await this.resolveContestOrThrow(contestId);
    if (!(await this.canJudgeManageContest(contest.id, contest.createdById, judgeUserId, judgeProfileId))) {
      throw new ForbiddenException();
    }

    const participants = await this.tpRepo.find({
      where: { contestId: contest.id },
      order: { createdAt: 'ASC' },
    });

    return participants.map((tp) => ({
      id: tp.id,
      participantId: tp.participantId,
      fullName: tp.fullName,
      username: tp.user?.username ?? null,
      password: tp.loginPassword ?? null,
      createdAt: tp.createdAt,
    }));
  }

  async getAssignedContestsForParticipant(participantUserId: string) {
    const assignments = await this.tpRepo.find({
      where: { userId: participantUserId },
      relations: ['contest'],
      order: { createdAt: 'DESC' },
    });

    const resolved = await Promise.all(assignments.map(async (assignment) => {
      let contest = assignment.contest ?? null;
      if (!contest && assignment.contestId) {
        contest = await this.contestRepo.findOne({ where: { id: assignment.contestId } });
      }
      if (!contest) return null;

      const phase = this.contestPhase(contest.startTime, contest.endTime);
      return {
        participantId: assignment.participantId,
        contestId: contest.id,
        contestNumber: contest.contestNumber,
        contest: {
          id: contest.id,
          contestNumber: contest.contestNumber,
          title: contest.title,
          type: contest.type,
          startTime: contest.startTime,
          endTime: contest.endTime,
          phase,
          status: phase === 'upcoming'
            ? ContestStatus.SCHEDULED
            : phase === 'running'
              ? ContestStatus.RUNNING
              : ContestStatus.ENDED,
        },
      };
    }));

    const phasePriority: Record<'running' | 'upcoming' | 'old', number> = {
      running: 0,
      upcoming: 1,
      old: 2,
    };

    return resolved
      .filter((item): item is NonNullable<typeof item> => !!item)
      .sort((a, b) => {
        const aPriority = phasePriority[a.contest.phase as 'running' | 'upcoming' | 'old'] ?? 3;
        const bPriority = phasePriority[b.contest.phase as 'running' | 'upcoming' | 'old'] ?? 3;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return new Date(a.contest.startTime).getTime() - new Date(b.contest.startTime).getTime();
      });
  }

  async getContestCredentialsPdf(contestId: string, judgeUserId: string) {
    const participants = await this.getContestParticipants(contestId, judgeUserId);
    if (!participants.length) {
      throw new BadRequestException('No temporary participants found for this contest');
    }

    const credentials = participants
      .filter(p => p.username && p.password)
      .map(p => ({
        username: p.username as string,
        password: p.password as string,
        name: p.fullName,
      }));

    if (!credentials.length) {
      throw new BadRequestException('No credential records available to export');
    }

    const credentialsPdfBase64 = await this.credentialsPdf.generateCredentialsPdf(credentials);
    return {
      totalParticipants: participants.length,
      exportedCredentials: credentials.length,
      credentialsPdfBase64,
    };
  }

  // ─── FUTURE JUDGE WEBHOOK ─────────────────────────────────────────────────────

  async receiveJudgeResult(subId: string, dto: ContestJudgeResultDto) {
    const sub = await this.subRepo.findOneBy({ id: subId });
    if (!sub) throw new NotFoundException();
    sub.submissionStatus = dto.verdict.toUpperCase() as unknown as SubmissionStatus;
    sub.executionTimeMs = dto.executionTimeMs ?? null;
    sub.memoryUsedKb = dto.memoryUsedKb ?? null;
    const saved = await this.subRepo.save(sub);
    // Push to contest room
    this.gateway.sendToContest(sub.contestId, 'verdict', {
      submissionId: sub.id,
      verdict: saved.submissionStatus,
    });
    return this.serializeSubmission(saved);
  }
}

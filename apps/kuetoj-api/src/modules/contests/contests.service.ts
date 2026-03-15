import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contest } from './entities/contest.entity';
import { Problem } from './entities/problem.entity';
import { ContestProblem } from './entities/contest-problem.entity';
import { ContestSubmission } from './entities/contest-submission.entity';
import { ContestAnnouncement } from './entities/contest-announcement.entity';
import { ContestClarification, ClarificationStatus } from './entities/contest-clarification.entity';
import { User } from '../users/entities/user.entity';
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
} from './dto/contests.dto';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationType } from '../notifications/entities/notification.entity';
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
    @InjectRepository(TempParticipant) private tpRepo: Repository<TempParticipant>,
    private dataSource: DataSource,
    private storage: StorageService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
  ) {}

  // ─── PROBLEM BANK ────────────────────────────────────────────────────────────

  async createProblem(dto: CreateProblemDto, judgeUserId: string): Promise<Problem> {
    const p = this.problemRepo.create({
      title: dto.title,
      statement: dto.statement,
      timeLimitMs: dto.timeLimitMs ?? null,
      memoryLimitKb: dto.memoryLimitKb ?? null,
      sampleTestCases: dto.sampleTestCases ?? [],
      authorId: judgeUserId,
    });
    return this.problemRepo.save(p);
  }

  async listMyProblems(judgeUserId: string): Promise<Problem[]> {
    return this.problemRepo.find({ where: { authorId: judgeUserId } });
  }

  async getProblemById(id: string): Promise<Problem> {
    const p = await this.problemRepo.findOneBy({ id });
    if (!p) throw new NotFoundException('Problem not found');
    return p;
  }

  async updateProblem(id: string, dto: Partial<CreateProblemDto>, judgeUserId: string) {
    const p = await this.getProblemById(id);
    if (p.authorId !== judgeUserId) throw new ForbiddenException();
    Object.assign(p, dto);
    return this.problemRepo.save(p);
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
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const contest = qr.manager.create(Contest, {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        freezeTime: dto.freezeTime ? new Date(dto.freezeTime) : null,
        createdById: judgeUserId,
        status: ContestStatus.DRAFT,
        isStandingFrozen: false,
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

  async getContestById(id: string): Promise<Contest> {
    const c = await this.contestRepo.findOne({
      where: { id },
      relations: ['problems', 'problems.problem'],
    });
    if (!c) throw new NotFoundException('Contest not found');
    return c;
  }

  async listContests(): Promise<Contest[]> {
    return this.contestRepo.find({ order: { startTime: 'DESC' } });
  }

  async listMyContests(judgeUserId: string): Promise<Contest[]> {
    return this.contestRepo.find({ where: { createdById: judgeUserId }, order: { startTime: 'DESC' } });
  }

  async updateContestStatus(contestId: string, status: ContestStatus, judgeUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== judgeUserId) throw new ForbiddenException();
    c.status = status;
    return this.contestRepo.save(c);
  }

  async addProblemToContest(contestId: string, dto: AddContestProblemDto, judgeUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== judgeUserId) throw new ForbiddenException();
    if (c.status !== ContestStatus.DRAFT) throw new BadRequestException('Contest already started');

    const cp = this.cpRepo.create({
      contestId,
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

    // If standings are frozen, only judge sees live standings
    const showFrozen = contest.isStandingFrozen && !judgeUserId;

    const problems = await this.cpRepo.find({
      where: { contestId },
      order: { orderIndex: 'ASC' },
    });

    // All accepted/graded submissions
    const subs = await this.subRepo.find({
      where: { contestId },
      order: { submittedAt: 'ASC' },
    });

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
          participantName: sub.participantName ?? sub.participantId,
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
      isFrozen: contest.isStandingFrozen,
      problems: problems.map(p => ({ label: p.label, problemId: p.problemId })),
      rows: rows.map((r, idx) => ({ rank: idx + 1, ...r })),
    };
  }

  async freezeStandings(contestId: string, frozen: boolean, judgeUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== judgeUserId) throw new ForbiddenException();
    c.isStandingFrozen = frozen;
    const saved = await this.contestRepo.save(c);
    // Broadcast to all participants
    this.gateway.sendToContest(contestId, 'standings:freeze', { frozen });
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
    const contest = await this.contestRepo.findOneBy({ id: contestId });
    if (!contest) throw new NotFoundException();
    const now = new Date();
    if (contest.status !== ContestStatus.RUNNING)
      throw new ForbiddenException('Contest is not running');
    if (now < contest.startTime || now > contest.endTime)
      throw new ForbiddenException('Contest window closed');

    const cp = await this.cpRepo.findOneBy({ id: dto.contestProblemId, contestId });
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
      contestId,
      contestProblemId: dto.contestProblemId,
      participantId: participantUserId,
      participantName,
      code: dto.code ?? null,
      fileUrl,
      fileName,
      language: dto.language ?? null,
      submissionStatus: SubmissionStatus.PENDING,
      judgeToken: uuidv4(),
    });
    return this.subRepo.save(sub);
  }

  async getMySubmissions(contestId: string, participantUserId: string) {
    return this.subRepo.find({
      where: { contestId, participantId: participantUserId },
      order: { submittedAt: 'DESC' },
    });
  }

  async getAllSubmissions(contestId: string, judgeUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== judgeUserId) throw new ForbiddenException();
    return this.subRepo.find({
      where: { contestId },
      order: { submittedAt: 'DESC' },
    });
  }

  async gradeSubmission(subId: string, dto: GradeContestSubmissionDto, judgeUserId: string) {
    const sub = await this.subRepo.findOne({
      where: { id: subId },
      relations: ['contest'],
    });
    if (!sub) throw new NotFoundException();
    if (sub.contest.createdById !== judgeUserId) throw new ForbiddenException();

    const verdictUpper = (dto.verdict.toUpperCase().replace(/-/g, '_')) as ManualVerdict;
    sub.manualVerdict = verdictUpper;
    sub.submissionStatus = SubmissionStatus.MANUAL_REVIEW;
    sub.score = dto.score ?? null;

    // ICPC: compute penalty immediately
    if (sub.contest.type === ContestType.ICPC &&
        verdictUpper === ManualVerdict.ACCEPTED) {
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
    return saved;
  }

  // ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

  async createAnnouncement(
    contestId: string,
    dto: CreateAnnouncementDto,
    authorId: string,
  ) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== authorId) throw new ForbiddenException();

    const ann = this.announcementRepo.create({
      contestId,
      authorId,
      title: dto.title,
      body: dto.body,
      isPinned: dto.isPinned ?? false,
    });
    const saved = await this.announcementRepo.save(ann);

    // Real-time push to all in contest room
    this.gateway.sendToContest(contestId, 'announcement', {
      id: saved.id,
      title: saved.title,
      body: saved.body,
      isPinned: saved.isPinned,
      createdAt: saved.createdAt,
    });

    // Also notify enrolled participants via notification system
    const participants = await this.tpRepo.find({ where: { contestId } });
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
          referenceId: contestId,
        });
      }
    }

    return saved;
  }

  async getAnnouncements(contestId: string) {
    return this.announcementRepo.find({
      where: { contestId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── CLARIFICATIONS ───────────────────────────────────────────────────────────

  async askClarification(contestId: string, dto: AskClarificationDto, participantUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();

    const clar = this.clarRepo.create({
      contestId,
      participantId: participantUserId,
      question: dto.question,
      contestProblemId: dto.contestProblemId ?? null,
      status: ClarificationStatus.OPEN,
    });
    return this.clarRepo.save(clar);
  }

  async getPendingClarifications(contestId: string, judgeUserId: string) {
    const c = await this.contestRepo.findOneBy({ id: contestId });
    if (!c) throw new NotFoundException();
    if (c.createdById !== judgeUserId) throw new ForbiddenException();
    return this.clarRepo.find({
      where: { contestId, status: ClarificationStatus.OPEN },
      order: { createdAt: 'ASC' },
    });
  }

  async answerClarification(
    clarId: string,
    dto: AnswerClarificationDto,
    judgeUserId: string,
  ) {
    const clar = await this.clarRepo.findOne({
      where: { id: clarId },
      relations: ['contest'],
    });
    if (!clar) throw new NotFoundException();
    if (clar.contest.createdById !== judgeUserId) throw new ForbiddenException();

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

  async getMyClarifications(contestId: string, participantUserId: string) {
    return this.clarRepo.find({
      where: { contestId, participantId: participantUserId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── TEMP PARTICIPANTS ────────────────────────────────────────────────────────

  async createTempParticipants(dto: CreateTempParticipantsDto, judgeUserId: string) {
    const contest = await this.contestRepo.findOneBy({ id: dto.contestId });
    if (!contest) throw new NotFoundException('Contest not found');
    if (contest.createdById !== judgeUserId) throw new ForbiddenException();
    if (dto.count < 1 || dto.count > 200)
      throw new BadRequestException('Count must be between 1 and 200');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const results: { username: string; password: string; participantId: string }[] = [];

      // Find the highest existing TP number for this contest
      const existing = await qr.manager.find(TempParticipant, { where: { contestId: dto.contestId } });
      let counter = existing.length;

      for (let i = 0; i < dto.count; i++) {
        counter++;
        const participantId = `TP-${String(counter).padStart(3, '0')}`;
        const username = `tp_${dto.contestId.slice(0, 8)}_${String(counter).padStart(3, '0')}`;
        const plainPassword = Math.random().toString(36).slice(-8).toUpperCase();

        const user = qr.manager.create(User, {
          username,
          password: plainPassword,
          role: UserRole.TEMP_PARTICIPANT,
          isFirstLogin: false,
          isActive: true,
          expiresAt: new Date(dto.accessUntil),
        });
        await qr.manager.save(user);

        const tp = qr.manager.create(TempParticipant, {
          participantId,
          fullName: `Participant ${counter}`,
          contestId: dto.contestId,
          accessFrom: new Date(dto.accessFrom),
          accessUntil: new Date(dto.accessUntil),
          createdByJudgeId: judgeUserId,
          userId: user.id,
        });
        await qr.manager.save(tp);

        results.push({ username, password: plainPassword, participantId });
      }

      await qr.commitTransaction();
      return results;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
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
    return saved;
  }
}

import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LabTest } from './entities/lab-test.entity';
import { LabTestStatus } from './entities/lab-test.entity';
import { LabTestProblem } from './entities/lab-test-problem.entity';
import { LabSubmission } from './entities/lab-submission.entity';
import { CreateLabTestDto, ManualGradeDto, SubmitLabCodeDto } from './dto/lab-tests.dto';
import { StorageService } from '../storage/storage.service';
import { LabTestType, ManualVerdict, SubmissionStatus } from '../../common/enums';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LabTestsService {
  constructor(
    @InjectRepository(LabTest) private labTestRepo: Repository<LabTest>,
    @InjectRepository(LabTestProblem) private problemRepo: Repository<LabTestProblem>,
    @InjectRepository(LabSubmission) private submissionRepo: Repository<LabSubmission>,
    private dataSource: DataSource,
    private storage: StorageService,
  ) {}

  // ─── TEACHER ────────────────────────────────────────────────────────────────

  async createLabTest(dto: CreateLabTestDto, teacherUserId: string): Promise<LabTest> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const labTest = qr.manager.create(LabTest, {
        courseId: dto.courseId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        totalMarks: dto.totalMarks,
        status: LabTestStatus.DRAFT,
      });
      await qr.manager.save(labTest);

      for (let i = 0; i < dto.problems.length; i++) {
        const p = dto.problems[i];
        const problem = qr.manager.create(LabTestProblem, {
          ...p,
          labTestId: labTest.id,
          orderIndex: i + 1,
        });
        await qr.manager.save(problem);
      }

      await qr.commitTransaction();
      return this.getLabTestById(labTest.id);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async updateLabTestStatus(labTestId: string, status: LabTestStatus, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    labTest.status = status;
    return this.labTestRepo.save(labTest);
  }

  async getLabTestsByCourse(courseId: string): Promise<LabTest[]> {
    return this.labTestRepo.find({
      where: { courseId },
      order: { startTime: 'DESC' },
    });
  }

  async getLabTestById(id: string): Promise<LabTest> {
    const labTest = await this.labTestRepo.findOne({
      where: { id },
      relations: ['problems'],
      order: { problems: { orderIndex: 'ASC' } } as any,
    });
    if (!labTest) throw new NotFoundException('Lab test not found');
    return labTest;
  }

  async getSubmissionsForProblem(problemId: string, teacherUserId: string) {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');

    return this.submissionRepo.find({
      where: { problemId },
      order: { submittedAt: 'ASC' },
    });
  }

  async getAllSubmissionsForLabTest(labTestId: string, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException();

    const problems = await this.problemRepo.findBy({ labTestId });
    const problemIds = problems.map(p => p.id);
    if (!problemIds.length) return [];

    return this.dataSource
      .getRepository(LabSubmission)
      .createQueryBuilder('sub')
      .where('sub.problemId IN (:...problemIds)', { problemIds })
      .orderBy('sub.submittedAt', 'ASC')
      .getMany();
  }

  async gradeSubmission(submissionId: string, dto: ManualGradeDto, teacherUserId: string) {
    const sub = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['problem', 'problem.labTest'],
    });
    if (!sub) throw new NotFoundException();

    sub.manualVerdict = dto.verdict;
    sub.score = dto.score ?? null;
    sub.instructorNote = dto.instructorNote ?? null;
    sub.gradedById = teacherUserId;
    sub.gradedAt = new Date();
    sub.submissionStatus = SubmissionStatus.MANUAL_REVIEW;
    return this.submissionRepo.save(sub);
  }

  // ─── STUDENT ────────────────────────────────────────────────────────────────

  async getRunningLabTestsForStudent(studentUserId: string): Promise<LabTest[]> {
    // Returns lab tests for courses the student is enrolled in (relies on enrollment check via courses)
    // Simple: fetch all RUNNING tests for now; course-scope enforced at enrollment level
    const now = new Date();
    return this.labTestRepo
      .createQueryBuilder('lt')
      .where('lt.status = :status', { status: LabTestStatus.RUNNING })
      .andWhere('lt.startTime <= :now', { now })
      .andWhere('lt.endTime >= :now', { now })
      .orderBy('lt.startTime', 'ASC')
      .getMany();
  }

  async getProblemsForStudent(labTestId: string): Promise<LabTestProblem[]> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException();
    if (labTest.status === LabTestStatus.DRAFT) throw new ForbiddenException('Lab test not started');

    return this.problemRepo.find({
      where: { labTestId },
      order: { orderIndex: 'ASC' },
    });
  }

  async submitCode(
    problemId: string,
    studentUserId: string,
    dto: SubmitLabCodeDto,
    file?: Express.Multer.File,
  ): Promise<LabSubmission> {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');

    const now = new Date();
    const labTest = problem.labTest;
    if (labTest.status !== LabTestStatus.RUNNING)
      throw new ForbiddenException('Lab test is not currently running');
    if (now < labTest.startTime || now > labTest.endTime)
      throw new ForbiddenException('Submission window closed');

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file) {
      if (file.size > 256 * 1024) throw new BadRequestException('File too large (max 256KB)');
      const saved = await this.storage.saveBuffer(
        file.buffer,
        `${uuidv4()}_${file.originalname}`,
        'submissions',
        256 * 1024,
      );
      fileUrl = saved.url;
      fileName = file.originalname;
    }

    if (!dto.code && !fileUrl) throw new BadRequestException('Code or file is required');

    const sub = this.submissionRepo.create({
      problemId,
      studentId: studentUserId,
      code: dto.code ?? null,
      fileUrl,
      fileName,
      language: dto.language ?? null,
      submissionStatus: SubmissionStatus.PENDING,
      judgeToken: uuidv4(), // for future judge integration
    });
    return this.submissionRepo.save(sub);
  }

  async getMySubmissionsForProblem(problemId: string, studentUserId: string) {
    return this.submissionRepo.find({
      where: { problemId, studentId: studentUserId },
      order: { submittedAt: 'DESC' },
    });
  }

  // ─── FUTURE JUDGE WEBHOOK ────────────────────────────────────────────────────

  /**
   * POST /api/lab-submissions/:id/result
   * Called by external judge after evaluation.
   * @param submissionId
   * @param verdict  one of SubmissionStatus values
   * @param executionTimeMs
   * @param memoryUsedKb
   */
  async receiveJudgeResult(
    submissionId: string,
    verdict: SubmissionStatus,
    executionTimeMs?: number,
    memoryUsedKb?: number,
  ) {
    const sub = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!sub) throw new NotFoundException();
    sub.submissionStatus = verdict;
    sub.executionTimeMs = executionTimeMs ?? null;
    sub.memoryUsedKb = memoryUsedKb ?? null;
    return this.submissionRepo.save(sub);
  }
}

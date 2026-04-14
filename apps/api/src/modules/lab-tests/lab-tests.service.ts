import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabTest, LabActivityKind, LabTestStatus } from './entities/lab-test.entity';
import { LabTestProblem } from './entities/lab-test-problem.entity';
import { LabSubmission } from './entities/lab-submission.entity';
import {
  CreateLabTestDto,
  CreateProblemDto,
  ImportProblemDto,
  ManualGradeDto,
  RunLabCodeDto,
  SubmitLabCodeDto,
} from './dto/lab-tests.dto';
import { Problem } from '../contests/entities/problem.entity';
import { StorageService } from '../storage/storage.service';
import { LabJudgeRemoteService } from './judge-remote.service';
import { JudgeJobPayload, JudgeResultPayload } from './judge.types';
import {
  ManualVerdict,
  ProgrammingLanguage,
  SubmissionStatus,
} from '../../common/enums';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { Student } from '../users/entities/student.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class LabTestsService {
  constructor(
    @InjectRepository(LabTest) private labTestRepo: Repository<LabTest>,
    @InjectRepository(LabTestProblem)
    private problemRepo: Repository<LabTestProblem>,
    @InjectRepository(LabSubmission)
    private submissionRepo: Repository<LabSubmission>,
    @InjectRepository(Problem)
    private problemBankRepo: Repository<Problem>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    private dataSource: DataSource,
    private storage: StorageService,
    private judgeRemote: LabJudgeRemoteService,
    private notifications: NotificationsService,
  ) {}

  private async getTeacherCourseAccess(courseId: string, teacherUserId: string) {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['teachers'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const assigned = (course.teachers ?? []).some((item) => item.id === teacher.id);
    if (!assigned) {
      throw new ForbiddenException('You are not assigned to this course');
    }

    return { teacher, course };
  }

  private async getStudentCourseAccess(courseId: string, studentUserId: string) {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
      relations: ['user'],
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { courseId, studentId: student.id, isActive: true },
      relations: ['course'],
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    return { student, course: enrollment.course };
  }

  private async notifyStudentsAboutActivity(labTest: LabTest) {
    const enrollments = await this.enrollmentRepo.find({
      where: { courseId: labTest.courseId, isActive: true },
      relations: ['student'],
    });
    const recipientUserIds = Array.from(
      new Set(
        enrollments
          .map((enrollment) => enrollment.student?.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    if (!recipientUserIds.length) return;

    await this.notifications.createBulk(recipientUserIds, {
      type: NotificationType.SYSTEM,
      title:
        labTest.activityKind === LabActivityKind.LAB_TASK
          ? `New Lab Task: ${labTest.title}`
          : `New Lab Test: ${labTest.title}`,
      body:
        labTest.activityKind === LabActivityKind.LAB_TASK
          ? 'A new lab task is available in one of your courses.'
          : 'A new lab test has been scheduled in one of your courses.',
      referenceId: labTest.id,
      targetPath: `/student/lab-tests/${labTest.id}`,
    });
  }

  private inferLanguageFromFileName(
    fileName: string | null | undefined,
  ): ProgrammingLanguage | null {
    const normalized = `${fileName ?? ''}`.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.endsWith('.c')) return ProgrammingLanguage.C;
    if (
      normalized.endsWith('.cc') ||
      normalized.endsWith('.cpp') ||
      normalized.endsWith('.cxx')
    ) {
      return ProgrammingLanguage.CPP;
    }
    if (normalized.endsWith('.java')) return ProgrammingLanguage.JAVA;
    if (normalized.endsWith('.py')) return ProgrammingLanguage.PYTHON3;
    if (normalized.endsWith('.js')) return ProgrammingLanguage.JAVASCRIPT;
    if (normalized.endsWith('.ts')) return ProgrammingLanguage.TYPESCRIPT;
    return null;
  }

  private buildProblemCopy(problem: Problem | CreateProblemDto, sourceProblemId?: string | null) {
    const marks = 'marks' in problem ? problem.marks ?? null : null;
    return {
      title: problem.title,
      statement: problem.statement,
      inputDescription:
        'inputDescription' in problem ? problem.inputDescription ?? null : null,
      outputDescription:
        'outputDescription' in problem ? problem.outputDescription ?? null : null,
      marks,
      timeLimitMs: problem.timeLimitMs ?? 1000,
      memoryLimitKb: problem.memoryLimitKb ?? 262144,
      sampleTestCases: (problem.sampleTestCases ?? []).map((item: any) => ({
        input: item.input ?? '',
        output: item.output ?? '',
        explanation: item.explanation ?? undefined,
      })),
      hiddenTestCases:
        'hiddenTestCases' in problem
          ? (problem.hiddenTestCases ?? []).map((item: any) => ({
              input: item.input ?? '',
              output: item.output ?? '',
            }))
          : [],
      sourceProblemId: sourceProblemId ?? null,
    };
  }

  private async saveProblemIntoBank(dto: CreateProblemDto, teacherUserId: string) {
    const bankProblem = this.problemBankRepo.create({
      title: dto.title.trim(),
      statement: dto.statement.trim(),
      inputDescription: dto.inputDescription?.trim() || null,
      outputDescription: dto.outputDescription?.trim() || null,
      timeLimitMs: dto.timeLimitMs ?? 1000,
      memoryLimitKb: dto.memoryLimitKb ?? 262144,
      sampleTestCases: dto.sampleTestCases ?? [],
      hiddenTestCases: dto.hiddenTestCases ?? [],
      authorId: teacherUserId,
      isPublic: true,
    });
    return this.problemBankRepo.save(bankProblem);
  }

  private async buildJudgeJobPayload(
    problem: LabTestProblem,
    sourceCode: string,
    language: ProgrammingLanguage,
    submissionId: string,
    includeHiddenCases: boolean,
  ): Promise<JudgeJobPayload> {
    const sampleCases = (problem.sampleTestCases ?? []).map((testCase, index) => ({
      index: index + 1,
      isSample: true,
      input: testCase.input ?? '',
      output: testCase.output ?? '',
    }));
    const hiddenCases = includeHiddenCases
      ? (problem.hiddenTestCases ?? []).map((testCase, index) => ({
          index: sampleCases.length + index + 1,
          isSample: false,
          input: testCase.input ?? '',
          output: testCase.output ?? '',
        }))
      : [];

    const testCases = [...sampleCases, ...hiddenCases];
    if (!testCases.length) {
      throw new BadRequestException('Problem has no test cases configured');
    }

    return {
      submissionId,
      language,
      sourceCode,
      sourceFileName: null,
      maxScore: problem.marks ?? null,
      problem: {
        id: problem.id,
        code: problem.sourceProblemId ?? null,
        title: problem.title,
        timeLimitMs: problem.timeLimitMs ?? 1000,
        memoryLimitKb: problem.memoryLimitKb ?? 262144,
      },
      testCases,
    };
  }

  private async judgeProblemSubmission(
    problem: LabTestProblem,
    sourceCode: string,
    language: ProgrammingLanguage,
    includeHiddenCases: boolean,
    submissionId = `run-${uuidv4()}`,
  ): Promise<JudgeResultPayload> {
    if (!this.judgeRemote.isEnabled()) {
      throw new BadRequestException('Remote judge is not enabled');
    }

    const job = await this.buildJudgeJobPayload(
      problem,
      sourceCode,
      language,
      submissionId,
      includeHiddenCases,
    );
    return this.judgeRemote.executeJob(job);
  }

  private sanitizeProblemForStudent(problem: LabTestProblem) {
    return {
      ...problem,
      hiddenTestCases: [],
    };
  }

  // Teacher

  async createLabTest(
    dto: CreateLabTestDto,
    teacherUserId: string,
  ): Promise<LabTest> {
    await this.getTeacherCourseAccess(dto.courseId, teacherUserId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const labTest = qr.manager.create(LabTest, {
        courseId: dto.courseId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        activityKind: dto.activityKind,
        type: dto.type,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        totalMarks: dto.totalMarks ?? null,
        status: LabTestStatus.DRAFT,
      });
      await qr.manager.save(labTest);

      const problems = dto.problems ?? [];
      for (let index = 0; index < problems.length; index += 1) {
        const bankProblem =
          problems[index].saveToBank === false
            ? null
            : await this.saveProblemIntoBank(problems[index], teacherUserId);

        const problem = qr.manager.create(LabTestProblem, {
          ...this.buildProblemCopy(problems[index], bankProblem?.id ?? null),
          labTestId: labTest.id,
          orderIndex: index + 1,
        });
        await qr.manager.save(problem);
      }

      await qr.commitTransaction();
      const saved = await this.getLabTestById(labTest.id);
      await this.notifyStudentsAboutActivity(saved);
      return saved;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async listReusableProblems(teacherUserId: string): Promise<Problem[]> {
    return this.problemBankRepo
      .createQueryBuilder('problem')
      .where('problem.authorId IS NOT NULL')
      .orWhere('problem.isPublic = true')
      .orWhere('problem.authorId = :teacherUserId', { teacherUserId })
      .orderBy('problem.updatedAt', 'DESC')
      .getMany();
  }

  async getProblemsForTeacher(labTestId: string, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    return this.problemRepo.find({
      where: { labTestId },
      order: { orderIndex: 'ASC' },
    });
  }

  async addProblem(
    labTestId: string,
    dto: CreateProblemDto,
    teacherUserId: string,
  ): Promise<LabTestProblem> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    const existingCount = await this.problemRepo.count({ where: { labTestId } });
    if (labTest.activityKind === LabActivityKind.LAB_TASK && existingCount >= 1) {
      throw new BadRequestException('Lab task can contain only one problem');
    }

    const bankProblem =
      dto.saveToBank === false
        ? null
        : await this.saveProblemIntoBank(dto, teacherUserId);

    const problem = this.problemRepo.create({
      ...this.buildProblemCopy(dto, bankProblem?.id ?? null),
      labTestId,
      orderIndex: existingCount + 1,
    });

    return this.problemRepo.save(problem);
  }

  async importProblem(
    labTestId: string,
    dto: ImportProblemDto,
    teacherUserId: string,
  ): Promise<LabTestProblem> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    const sourceProblem = await this.problemBankRepo.findOneBy({ id: dto.problemId });
    if (!sourceProblem) throw new NotFoundException('Problem bank entry not found');

    const existingCount = await this.problemRepo.count({ where: { labTestId } });
    if (labTest.activityKind === LabActivityKind.LAB_TASK && existingCount >= 1) {
      throw new BadRequestException('Lab task can contain only one problem');
    }

    const problem = this.problemRepo.create({
      ...this.buildProblemCopy(sourceProblem, sourceProblem.id),
      marks: sourceProblem.contestProblems?.[0]?.score ?? null,
      labTestId,
      orderIndex: existingCount + 1,
    });
    return this.problemRepo.save(problem);
  }

  async updateLabTestStatus(
    labTestId: string,
    status: LabTestStatus,
    teacherUserId: string,
  ) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);
    labTest.status = status;
    return this.labTestRepo.save(labTest);
  }

  async startLabTest(labTestId: string, teacherUserId: string) {
    return this.updateLabTestStatus(labTestId, LabTestStatus.RUNNING, teacherUserId);
  }

  async endLabTest(labTestId: string, teacherUserId: string) {
    return this.updateLabTestStatus(labTestId, LabTestStatus.ENDED, teacherUserId);
  }

  async getLabTestsByCourse(
    courseId: string,
    requesterUserId: string,
    role: UserRole,
    activityKind?: LabActivityKind,
  ): Promise<LabTest[]> {
    if (role === UserRole.TEACHER) {
      await this.getTeacherCourseAccess(courseId, requesterUserId);
    } else {
      await this.getStudentCourseAccess(courseId, requesterUserId);
    }

    const labTests = await this.labTestRepo.find({
      where: activityKind ? { courseId, activityKind } : { courseId },
      order: { startTime: 'DESC' },
    });

    if (role === UserRole.STUDENT) {
      return labTests.filter((labTest) => labTest.status !== LabTestStatus.DRAFT);
    }

    return labTests;
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

  async getLabTestByIdForTeacher(id: string, teacherUserId: string) {
    const labTest = await this.getLabTestById(id);
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);
    return labTest;
  }

  async getLabTestByIdForStudent(id: string, studentUserId: string) {
    const labTest = await this.getLabTestById(id);
    await this.getStudentCourseAccess(labTest.courseId, studentUserId);
    return {
      ...labTest,
      problems: (labTest.problems ?? []).map((problem) =>
        this.sanitizeProblemForStudent(problem),
      ),
    };
  }

  async getSubmissionsForProblem(problemId: string, teacherUserId: string) {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');
    await this.getTeacherCourseAccess(problem.labTest.courseId, teacherUserId);

    return this.submissionRepo.find({
      where: { problemId },
      relations: ['student'],
      order: { submittedAt: 'ASC' },
    });
  }

  async getAllSubmissionsForLabTest(labTestId: string, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    const problems = await this.problemRepo.findBy({ labTestId });
    const problemIds = problems.map((problem) => problem.id);
    if (!problemIds.length) return [];

    return this.submissionRepo.find({
      where: problemIds.map((problemId) => ({ problemId })),
      relations: ['student', 'problem'],
      order: { submittedAt: 'DESC' },
    });
  }

  async gradeSubmission(
    submissionId: string,
    dto: ManualGradeDto,
    teacherUserId: string,
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['problem', 'problem.labTest'],
    });
    if (!submission) throw new NotFoundException('Submission not found');

    await this.getTeacherCourseAccess(
      submission.problem.labTest.courseId,
      teacherUserId,
    );

    submission.manualVerdict = dto.verdict;
    submission.score = dto.score ?? submission.score ?? null;
    submission.instructorNote = dto.instructorNote ?? null;
    submission.gradedById = teacherUserId;
    submission.gradedAt = new Date();
    submission.submissionStatus = SubmissionStatus.MANUAL_REVIEW;
    return this.submissionRepo.save(submission);
  }

  // Student

  async getRunningLabTestsForStudent(studentUserId: string): Promise<LabTest[]> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrollments = await this.enrollmentRepo.find({
      where: { studentId: student.id, isActive: true },
    });
    const courseIds = enrollments.map((enrollment) => enrollment.courseId);
    if (!courseIds.length) return [];

    return this.labTestRepo
      .createQueryBuilder('labTest')
      .where('labTest.courseId IN (:...courseIds)', { courseIds })
      .orderBy('labTest.startTime', 'DESC')
      .getMany();
  }

  async getProblemsForStudent(labTestId: string, studentUserId: string): Promise<any[]> {
    const labTest = await this.getLabTestById(labTestId);
    await this.getStudentCourseAccess(labTest.courseId, studentUserId);
    if (labTest.status === LabTestStatus.DRAFT) {
      throw new ForbiddenException('Lab activity has not started');
    }

    const problems = await this.problemRepo.find({
      where: { labTestId },
      order: { orderIndex: 'ASC' },
    });

    return problems.map((problem) => this.sanitizeProblemForStudent(problem));
  }

  async getMySubmissionsForLabTest(labTestId: string, studentUserId: string) {
    const labTest = await this.getLabTestById(labTestId);
    const { student } = await this.getStudentCourseAccess(labTest.courseId, studentUserId);
    const problems = await this.problemRepo.findBy({ labTestId });
    const problemIds = problems.map((problem) => problem.id);
    if (!problemIds.length) return [];

    return this.submissionRepo.find({
      where: problemIds.map((problemId) => ({ problemId, studentId: student.id })),
      relations: ['problem'],
      order: { submittedAt: 'DESC' },
    });
  }

  async runCode(problemId: string, studentUserId: string, dto: RunLabCodeDto) {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');

    await this.getStudentCourseAccess(problem.labTest.courseId, studentUserId);

    const sourceCode = dto.code?.trim();
    if (!sourceCode) {
      throw new BadRequestException('Code is required to run the solution');
    }
    if (!dto.language) {
      throw new BadRequestException('Language is required');
    }
    if (
      problem.labTest.status !== LabTestStatus.RUNNING ||
      new Date() < problem.labTest.startTime ||
      new Date() > problem.labTest.endTime
    ) {
      throw new ForbiddenException('Lab activity is not currently running');
    }

    return this.judgeProblemSubmission(problem, sourceCode, dto.language, false);
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

    const { student } = await this.getStudentCourseAccess(
      problem.labTest.courseId,
      studentUserId,
    );

    const now = new Date();
    if (problem.labTest.status !== LabTestStatus.RUNNING) {
      throw new ForbiddenException('Lab activity is not currently running');
    }
    const allowedDeadline = new Date(problem.labTest.endTime.getTime() + 5000);
    if (now < problem.labTest.startTime || now > allowedDeadline) {
      throw new ForbiddenException('Submission window closed');
    }

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    if (file) {
      if (file.size > 256 * 1024) {
        throw new BadRequestException('File too large (max 256KB)');
      }
      const saved = await this.storage.saveBuffer(
        file.buffer,
        `${uuidv4()}_${file.originalname}`,
        'submissions',
        256 * 1024,
      );
      fileUrl = saved.url;
      fileName = file.originalname;
    }

    const sourceCode = dto.code?.trim()
      ? dto.code.trim()
      : fileUrl
        ? await this.storage.readTextFileByUrl(fileUrl)
        : null;
    if (!sourceCode) {
      throw new BadRequestException('Code or file is required');
    }

    const language = dto.language ?? this.inferLanguageFromFileName(fileName);
    if (!language) {
      throw new BadRequestException('Language is required');
    }

    const submission = this.submissionRepo.create({
      problemId,
      studentId: student.id,
      code: dto.code ?? null,
      fileUrl,
      fileName,
      language,
      submissionStatus: SubmissionStatus.PENDING,
      judgeToken: uuidv4(),
      judgeMessage: null,
      compileOutput: null,
      testcaseResults: [],
    });
    const saved = await this.submissionRepo.save(submission);

    try {
      const judgeResult = await this.judgeProblemSubmission(
        problem,
        sourceCode,
        language,
        true,
        saved.id,
      );
      return this.applyJudgeResult(saved.id, judgeResult);
    } catch (error) {
      saved.submissionStatus = SubmissionStatus.MANUAL_REVIEW;
      saved.judgeMessage =
        error instanceof Error ? error.message : 'Judge execution failed';
      return this.submissionRepo.save(saved);
    }
  }

  async getMySubmissionsForProblem(problemId: string, studentUserId: string) {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');
    const { student } = await this.getStudentCourseAccess(
      problem.labTest.courseId,
      studentUserId,
    );

    return this.submissionRepo.find({
      where: { problemId, studentId: student.id },
      order: { submittedAt: 'DESC' },
    });
  }

  private async applyJudgeResult(
    submissionId: string,
    result: JudgeResultPayload,
  ): Promise<LabSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    submission.submissionStatus = result.verdict;
    submission.executionTimeMs = result.executionTimeMs ?? null;
    submission.memoryUsedKb = result.memoryUsedKb ?? null;
    submission.score = result.score ?? null;
    submission.judgeMessage = result.judgeMessage ?? null;
    submission.compileOutput = result.compileOutput ?? null;
    submission.testcaseResults = result.testcaseResults ?? [];
    return this.submissionRepo.save(submission);
  }

  async receiveJudgeResult(
    submissionId: string,
    verdict: SubmissionStatus,
    executionTimeMs?: number,
    memoryUsedKb?: number,
  ) {
    const submission = await this.submissionRepo.findOneBy({ id: submissionId });
    if (!submission) throw new NotFoundException('Submission not found');
    submission.submissionStatus = verdict;
    submission.executionTimeMs = executionTimeMs ?? null;
    submission.memoryUsedKb = memoryUsedKb ?? null;
    return this.submissionRepo.save(submission);
  }
}

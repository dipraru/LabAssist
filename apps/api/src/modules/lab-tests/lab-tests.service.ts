import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabTest, LabActivityKind, LabTestStatus } from './entities/lab-test.entity';
import { LabTestProblem } from './entities/lab-test-problem.entity';
import { LabSubmission } from './entities/lab-submission.entity';
import {
  LabProctoringEvent,
  LabProctoringEventType,
} from './entities/lab-proctoring-event.entity';
import {
  CreateLabTestDto,
  CreateProblemDto,
  ImportProblemDto,
  ManualGradeDto,
  ReportLabProctoringEventDto,
  RunLabCodeDto,
  SubmitLabCodeDto,
  UpdateLabActivityProblemDto,
  UpdateLabTestDto,
  UpdateProblemBankDto,
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
import { LabClass } from '../courses/entities/lab-class.entity';
import { LabClassSectionStatus } from '../courses/entities/lab-class-section.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { Student } from '../users/entities/student.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UserRole } from '../../common/enums/role.enum';
import { Batch, BatchSection } from '../office/entities/batch.entity';

function normalizeSectionName(sectionName?: string | null): string {
  return sectionName?.trim() || 'All Students';
}

function normalizeTextValue(value?: string | null): string {
  return value?.trim().toLowerCase() || '';
}

function studentIdFallsInsideSection(
  studentId: string,
  fromStudentId: string,
  toStudentId: string,
): boolean {
  const current = Number(studentId);
  const from = Number(fromStudentId);
  const to = Number(toStudentId);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return false;
  }

  return current >= Math.min(from, to) && current <= Math.max(from, to);
}

@Injectable()
export class LabTestsService {
  constructor(
    @InjectRepository(LabTest) private labTestRepo: Repository<LabTest>,
    @InjectRepository(LabTestProblem)
    private problemRepo: Repository<LabTestProblem>,
    @InjectRepository(LabSubmission)
    private submissionRepo: Repository<LabSubmission>,
    @InjectRepository(LabProctoringEvent)
    private proctoringEventRepo: Repository<LabProctoringEvent>,
    @InjectRepository(Problem)
    private problemBankRepo: Repository<Problem>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(LabClass)
    private labClassRepo: Repository<LabClass>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
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
      relations: ['teachers', 'semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const assigned = (course.teachers ?? []).some((item) => item.id === teacher.id);
    if (!assigned) {
      throw new ForbiddenException('You are not assigned to this course');
    }

    return { teacher, course };
  }

  private async getCourseBatchSections(course: Course): Promise<BatchSection[]> {
    if (!(course as Course & { semester?: any })?.semester?.batchYear) {
      return [];
    }

    const batch = await this.batchRepo.findOne({
      where: { year: (course as Course & { semester?: any }).semester.batchYear },
    });

    return batch?.sections ?? [];
  }

  private async getCourseSectionNames(course: Course): Promise<string[]> {
    const batchSections = await this.getCourseBatchSections(course);
    const batchNames = batchSections.map((section) => normalizeSectionName(section.name));
    const scheduleNames = Array.isArray((course as Course & { schedules?: any[] }).schedules)
      ? ((course as Course & { schedules?: any[] }).schedules ?? []).map((schedule: any) =>
          normalizeSectionName(schedule?.sectionName),
        )
      : [];

    const values = [...batchNames, ...scheduleNames].filter(Boolean);
    return Array.from(new Set(values.length ? values : ['All Students']));
  }

  private resolveStudentSection(
    student: Student,
    batchSections: BatchSection[],
  ): string {
    return (
      batchSections.find((section) =>
        studentIdFallsInsideSection(
          student.studentId,
          section.fromStudentId,
          section.toStudentId,
        ),
      )?.name ?? 'All Students'
    );
  }

  private async validateActivityPlacement(
    course: Course,
    activityKind: LabActivityKind,
    sectionName?: string | null,
    labClassId?: string | null,
  ): Promise<{
    sectionName: string;
    labClass: LabClass | null;
  }> {
    const courseSections = await this.getCourseSectionNames(course);
    const normalizedSectionName = normalizeSectionName(sectionName);

    if (!sectionName?.trim() && courseSections.length > 1) {
      throw new BadRequestException('Section is required');
    }

    if (!courseSections.includes(normalizedSectionName)) {
      throw new BadRequestException('Invalid section for this course');
    }

    let labClass: LabClass | null = null;
    if (labClassId) {
      labClass = await this.labClassRepo.findOne({
        where: { id: labClassId },
        relations: ['sections'],
      });
      if (!labClass || labClass.courseId !== course.id) {
        throw new BadRequestException('Selected lab class does not belong to this course');
      }
      if (
        !(labClass.sections ?? []).some(
          (section) => normalizeSectionName(section.sectionName) === normalizedSectionName,
        )
      ) {
        throw new BadRequestException('Selected lab class does not include this section');
      }

      if (
        activityKind === LabActivityKind.LAB_TASK &&
        !(labClass.sections ?? []).some(
          (section) =>
            normalizeSectionName(section.sectionName) === normalizedSectionName &&
            section.status === LabClassSectionStatus.CONDUCTED,
        )
      ) {
        throw new BadRequestException(
          'Lab task can be linked only to a conducted lab class for this section',
        );
      }
    }

    if (activityKind === LabActivityKind.LAB_TASK && !labClass) {
      throw new BadRequestException('Lab task must be linked to a lab class');
    }

    return {
      sectionName: normalizedSectionName,
      labClass,
    };
  }

  private async getStudentCourseAccess(
    courseId: string,
    studentUserId: string,
  ): Promise<{
    student: Student;
    course: Course & { batchSections: BatchSection[] };
    sectionName: string;
  }> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { courseId, studentId: student.id, isActive: true },
    });
    if (!enrollment || !course) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    const batchSections = await this.getCourseBatchSections(course);

    return {
      student,
      course: Object.assign(course, { batchSections }),
      sectionName: this.resolveStudentSection(student, batchSections),
    };
  }

  private async ensureStudentCanAccessLabTest(
    labTest: LabTest,
    studentUserId: string,
  ): Promise<{
    student: Student;
    course: Course & { batchSections: BatchSection[] };
    sectionName: string;
  }> {
    const access = await this.getStudentCourseAccess(labTest.courseId, studentUserId);
    const scopedSectionName = labTest.sectionName
      ? normalizeSectionName(labTest.sectionName)
      : null;

    if (
      scopedSectionName &&
      scopedSectionName !== 'All Students' &&
      scopedSectionName !== access.sectionName
    ) {
      throw new ForbiddenException('This lab activity is not assigned to your section');
    }

    return access;
  }

  private getActivityLabel(
    labTest: Pick<LabTest, 'title' | 'activityKind'> & {
      labClass?: { labNumber?: number | null } | null;
    },
  ): string {
    const explicitTitle = labTest.title?.trim();
    if (explicitTitle) {
      return explicitTitle;
    }

    if (labTest.activityKind === LabActivityKind.LAB_TASK) {
      if (labTest.labClass?.labNumber) {
        return `Lab ${labTest.labClass.labNumber} Task`;
      }
      return 'Lab Task';
    }

    return 'Lab Test';
  }

  private resolveDurationMinutes(values: {
    durationMinutes?: number | null;
    startTime?: string | Date | null;
    endTime?: string | Date | null;
  }): number {
    if (values.durationMinutes && values.durationMinutes > 0) {
      return values.durationMinutes;
    }

    if (values.startTime && values.endTime) {
      const start = new Date(values.startTime);
      const end = new Date(values.endTime);
      const diff = end.getTime() - start.getTime();
      if (Number.isFinite(diff) && diff > 0) {
        return Math.max(1, Math.ceil(diff / 60_000));
      }
    }

    return 60;
  }

  private async syncExpiredActivities(labTests: LabTest[]): Promise<void> {
    const expiredIds = labTests
      .filter(
        (labTest) =>
          labTest.status === LabTestStatus.RUNNING &&
          Boolean(labTest.endTime) &&
          new Date(labTest.endTime as Date).getTime() <= Date.now(),
      )
      .map((labTest) => labTest.id);

    if (!expiredIds.length) {
      return;
    }

    await this.labTestRepo.update({ id: In(expiredIds) }, { status: LabTestStatus.ENDED });
    labTests.forEach((labTest) => {
      if (expiredIds.includes(labTest.id)) {
        labTest.status = LabTestStatus.ENDED;
      }
    });
  }

  private async ensureProblemIsUnique(
    labTestId: string,
    values: {
      title?: string | null;
      statement?: string | null;
      sourceProblemId?: string | null;
    },
  ) {
    const existingProblems = await this.problemRepo.find({
      where: { labTestId },
      select: ['id', 'title', 'statement', 'sourceProblemId'],
    });

    if (
      values.sourceProblemId &&
      existingProblems.some((problem) => problem.sourceProblemId === values.sourceProblemId)
    ) {
      throw new BadRequestException('This problem is already added to the activity');
    }

    const normalizedTitle = normalizeTextValue(values.title);
    const normalizedStatement = normalizeTextValue(values.statement);
    if (!normalizedTitle || !normalizedStatement) {
      return;
    }

    const hasSameContent = existingProblems.some(
      (problem) =>
        normalizeTextValue(problem.title) === normalizedTitle &&
        normalizeTextValue(problem.statement) === normalizedStatement,
    );

    if (hasSameContent) {
      throw new BadRequestException('This problem is already added to the activity');
    }
  }

  private async notifyStudentsAboutActivity(labTest: LabTest) {
    const course = await this.courseRepo.findOne({
      where: { id: labTest.courseId },
      relations: ['semester'],
    });
    if (!course) return;

    const batchSections = await this.getCourseBatchSections(course);
    const scopedSectionName = labTest.sectionName
      ? normalizeSectionName(labTest.sectionName)
      : null;
    const enrollments = await this.enrollmentRepo.find({
      where: { courseId: labTest.courseId, isActive: true },
      relations: ['student'],
    });
    const recipientUserIds = Array.from(
      new Set(
        enrollments
          .filter((enrollment) => {
            if (!scopedSectionName || scopedSectionName === 'All Students') {
              return true;
            }

            return (
              this.resolveStudentSection(enrollment.student, batchSections) ===
              scopedSectionName
            );
          })
          .map((enrollment) => enrollment.student?.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    if (!recipientUserIds.length) return;

    await this.notifications.createBulk(recipientUserIds, {
      type: NotificationType.SYSTEM,
      title:
        labTest.activityKind === LabActivityKind.LAB_TASK
          ? `New Lab Task: ${this.getActivityLabel(labTest)}`
          : `New Lab Test: ${this.getActivityLabel(labTest)}`,
      body:
        labTest.activityKind === LabActivityKind.LAB_TASK
          ? 'A new lab task is available in one of your courses.'
          : 'A new lab test has been scheduled in one of your courses.',
      referenceId: labTest.id,
      targetPath: `/student/lab-tests/${labTest.id}`,
    });
  }

  private buildTeacherActivityHref(labTest: LabTest): string {
    return `/teacher/lab-tests?courseId=${labTest.courseId}&kind=${labTest.activityKind}&activityId=${labTest.id}`;
  }

  private describeProctoringEvent(eventType: LabProctoringEventType): string {
    switch (eventType) {
      case LabProctoringEventType.FULLSCREEN_EXIT:
        return 'left fullscreen mode';
      case LabProctoringEventType.TAB_HIDDEN:
        return 'switched away from the lab tab';
      case LabProctoringEventType.WINDOW_BLUR:
        return 'moved focus away from the lab window';
      case LabProctoringEventType.COPY_BLOCKED:
        return 'attempted to copy content';
      case LabProctoringEventType.PASTE_BLOCKED:
        return 'attempted to paste content';
      case LabProctoringEventType.CUT_BLOCKED:
        return 'attempted to cut content';
      default:
        return 'triggered a proctoring alert';
    }
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
    const normalizedTitle = problem.title?.trim() || 'Untitled Problem';
    const normalizedStatement = problem.statement?.trim() || '';
    return {
      title: normalizedTitle,
      statement: normalizedStatement,
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
    const problemCode = await this.generateProblemCode();
    const normalizedTitle = dto.title?.trim() || 'Untitled Problem';
    const normalizedStatement = dto.statement?.trim() || '';
    const bankProblem = this.problemBankRepo.create({
      problemCode,
      title: normalizedTitle,
      statement: normalizedStatement,
      inputDescription: dto.inputDescription?.trim() || null,
      outputDescription: dto.outputDescription?.trim() || null,
      timeLimitMs: dto.timeLimitMs ?? 1000,
      memoryLimitKb: dto.memoryLimitKb ?? 262144,
      sampleTestCases: dto.sampleTestCases ?? [],
      hiddenTestCases: dto.hiddenTestCases ?? [],
      authorId: teacherUserId,
      isPublic: false,
    });
    return this.problemBankRepo.save(bankProblem);
  }

  private async generateProblemCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
      const code = `TOJ-${suffix}`;
      const existing = await this.problemBankRepo.findOne({
        where: { problemCode: code },
        select: ['id'],
      });
      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Failed to generate a unique problem code');
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
    const { course } = await this.getTeacherCourseAccess(dto.courseId, teacherUserId);
    const { sectionName, labClass } = await this.validateActivityPlacement(
      course,
      dto.activityKind,
      dto.sectionName,
      dto.labClassId,
    );
    const durationMinutes = this.resolveDurationMinutes(dto);
    const title =
      dto.activityKind === LabActivityKind.LAB_TASK
        ? dto.title?.trim() || ''
        : dto.title?.trim();

    if (dto.activityKind === LabActivityKind.LAB_TEST && !title) {
      throw new BadRequestException('Title is required');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const labTest = qr.manager.create(LabTest, {
        courseId: dto.courseId,
        title: title ?? '',
        description: dto.description?.trim() || null,
        activityKind: dto.activityKind,
        type: dto.type,
        startTime: null,
        endTime: null,
        durationMinutes,
        totalMarks: dto.totalMarks ?? null,
        sectionName,
        labClassId: labClass?.id ?? null,
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
      return saved;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async updateLabTest(
    labTestId: string,
    dto: UpdateLabTestDto,
    teacherUserId: string,
  ): Promise<LabTest> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');

    const { course } = await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);
    await this.syncExpiredActivities([labTest]);

    if (labTest.status !== LabTestStatus.DRAFT) {
      throw new BadRequestException('Only draft activities can be edited');
    }

    const nextSectionName = dto.sectionName ?? labTest.sectionName ?? undefined;
    const nextLabClassId = dto.labClassId ?? labTest.labClassId ?? undefined;
    const { sectionName, labClass } = await this.validateActivityPlacement(
      course,
      labTest.activityKind,
      nextSectionName,
      nextLabClassId,
    );

    if (labTest.activityKind === LabActivityKind.LAB_TEST) {
      const nextTitle =
        dto.title !== undefined ? dto.title.trim() : (labTest.title ?? '').trim();
      if (!nextTitle) {
        throw new BadRequestException('Title is required');
      }
      labTest.title = nextTitle;
    } else if (dto.title !== undefined) {
      labTest.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      labTest.description = dto.description?.trim() || null;
    }
    if (dto.type) {
      labTest.type = dto.type;
    }
    if (dto.durationMinutes !== undefined) {
      labTest.durationMinutes = this.resolveDurationMinutes(dto);
    }
    if (dto.totalMarks !== undefined) {
      labTest.totalMarks = dto.totalMarks ?? null;
    }

    labTest.sectionName = sectionName;
    labTest.labClassId = labClass?.id ?? null;
    return this.labTestRepo.save(labTest);
  }

  async listReusableProblems(teacherUserId: string): Promise<Problem[]> {
    return this.problemBankRepo
      .createQueryBuilder('problem')
      .where('problem.authorId = :teacherUserId', { teacherUserId })
      .orWhere('problem.authorId IS NOT NULL')
      .orWhere('problem.isPublic = true')
      .orderBy('problem.updatedAt', 'DESC')
      .getMany();
  }

  async createReusableProblem(
    dto: CreateProblemDto,
    teacherUserId: string,
  ): Promise<Problem> {
    return this.saveProblemIntoBank(dto, teacherUserId);
  }

  async getReusableProblemById(id: string, teacherUserId: string): Promise<Problem> {
    const problem = await this.problemBankRepo.findOneBy({ id });
    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    if (problem.authorId !== teacherUserId && !problem.isPublic) {
      throw new ForbiddenException('You do not have access to this problem');
    }

    return problem;
  }

  async updateReusableProblem(
    id: string,
    dto: UpdateProblemBankDto,
    teacherUserId: string,
  ): Promise<Problem> {
    const problem = await this.problemBankRepo.findOneBy({ id });
    if (!problem) {
      throw new NotFoundException('Problem not found');
    }
    if (problem.authorId !== teacherUserId) {
      throw new ForbiddenException('Only your own problems can be edited');
    }

    if (dto.title !== undefined) {
      problem.title = dto.title.trim();
    }
    if (dto.statement !== undefined) {
      problem.statement = dto.statement.trim();
    }
    if (dto.inputDescription !== undefined) {
      problem.inputDescription = dto.inputDescription?.trim() || null;
    }
    if (dto.outputDescription !== undefined) {
      problem.outputDescription = dto.outputDescription?.trim() || null;
    }
    if (dto.timeLimitMs !== undefined) {
      problem.timeLimitMs = dto.timeLimitMs ?? null;
    }
    if (dto.memoryLimitKb !== undefined) {
      problem.memoryLimitKb = dto.memoryLimitKb ?? null;
    }
    if (dto.sampleTestCases !== undefined) {
      problem.sampleTestCases = dto.sampleTestCases ?? [];
    }
    if (dto.hiddenTestCases !== undefined) {
      problem.hiddenTestCases = dto.hiddenTestCases ?? [];
    }

    return this.problemBankRepo.save(problem);
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
    await this.ensureProblemIsUnique(labTestId, dto);

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
    await this.ensureProblemIsUnique(labTestId, {
      title: sourceProblem.title,
      statement: sourceProblem.statement,
      sourceProblemId: sourceProblem.id,
    });

    const problem = this.problemRepo.create({
      ...this.buildProblemCopy(sourceProblem, sourceProblem.id),
      marks: sourceProblem.contestProblems?.[0]?.score ?? null,
      labTestId,
      orderIndex: existingCount + 1,
    });
    return this.problemRepo.save(problem);
  }

  async removeProblem(
    labTestId: string,
    problemId: string,
    teacherUserId: string,
  ): Promise<{ success: true }> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    if (labTest.status !== LabTestStatus.DRAFT) {
      throw new BadRequestException('Problems can be removed only from draft activities');
    }

    const problem = await this.problemRepo.findOneBy({ id: problemId, labTestId });
    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    await this.problemRepo.remove(problem);

    const remaining = await this.problemRepo.find({
      where: { labTestId },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      if (item.orderIndex !== index + 1) {
        item.orderIndex = index + 1;
        await this.problemRepo.save(item);
      }
    }

    return { success: true };
  }

  async updateActivityProblem(
    labTestId: string,
    problemId: string,
    dto: UpdateLabActivityProblemDto,
    teacherUserId: string,
  ): Promise<LabTestProblem> {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) {
      throw new NotFoundException('Lab test not found');
    }
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    if (labTest.status !== LabTestStatus.DRAFT) {
      throw new BadRequestException('Problems can be updated only for draft activities');
    }

    const problem = await this.problemRepo.findOneBy({ id: problemId, labTestId });
    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    if (dto.marks !== undefined) {
      problem.marks = dto.marks ?? null;
    }

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
    const labTest = await this.labTestRepo.findOne({
      where: { id: labTestId },
      relations: ['labClass'],
    });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    await this.syncExpiredActivities([labTest]);
    if (labTest.status === LabTestStatus.ENDED) {
      throw new BadRequestException('Ended activity cannot be started again');
    }
    if (labTest.status === LabTestStatus.RUNNING) {
      return labTest;
    }

    const durationMinutes = this.resolveDurationMinutes(labTest);
    const startTime = new Date();
    labTest.status = LabTestStatus.RUNNING;
    labTest.startTime = startTime;
    labTest.endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
    labTest.durationMinutes = durationMinutes;
    const saved = await this.labTestRepo.save(labTest);
    await this.notifyStudentsAboutActivity(saved);
    return saved;
  }

  async endLabTest(labTestId: string, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    if (labTest.status !== LabTestStatus.RUNNING) {
      throw new BadRequestException('Only running activities can be ended');
    }

    const now = new Date();
    labTest.status = LabTestStatus.ENDED;
    labTest.endTime = now;
    if (!labTest.startTime) {
      labTest.startTime = now;
    }
    return this.labTestRepo.save(labTest);
  }

  async getLabTestsByCourse(
    courseId: string,
    requesterUserId: string,
    role: UserRole,
    activityKind?: LabActivityKind,
    sectionName?: string,
    labClassId?: string,
  ): Promise<LabTest[]> {
    let viewerSectionName: string | null = null;
    if (role === UserRole.TEACHER) {
      await this.getTeacherCourseAccess(courseId, requesterUserId);
    } else {
      const studentAccess = await this.getStudentCourseAccess(courseId, requesterUserId);
      viewerSectionName = studentAccess.sectionName;
    }

    const where: Record<string, any> = { courseId };
    if (activityKind) {
      where.activityKind = activityKind;
    }
    if (sectionName?.trim()) {
      where.sectionName = normalizeSectionName(sectionName);
    }
    if (labClassId?.trim()) {
      where.labClassId = labClassId.trim();
    }

    const labTests = await this.labTestRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    await this.syncExpiredActivities(labTests);

    if (role === UserRole.STUDENT) {
      return labTests.filter((labTest) => {
        if (labTest.status === LabTestStatus.DRAFT) {
          return false;
        }

        const scopedSectionName = labTest.sectionName
          ? normalizeSectionName(labTest.sectionName)
          : null;
        if (!scopedSectionName || scopedSectionName === 'All Students') {
          return true;
        }

        return scopedSectionName === viewerSectionName;
      });
    }

    return labTests;
  }

  async getLabTestById(id: string): Promise<LabTest> {
    const labTest = await this.labTestRepo.findOne({
      where: { id },
      relations: ['problems', 'labClass'],
      order: { problems: { orderIndex: 'ASC' } } as any,
    });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.syncExpiredActivities([labTest]);
    return labTest;
  }

  async getLabTestByIdForTeacher(id: string, teacherUserId: string) {
    const labTest = await this.getLabTestById(id);
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);
    return labTest;
  }

  async getLabTestByIdForStudent(id: string, studentUserId: string) {
    const labTest = await this.getLabTestById(id);
    await this.ensureStudentCanAccessLabTest(labTest, studentUserId);
    if (labTest.status === LabTestStatus.DRAFT) {
      throw new ForbiddenException('Lab activity has not started');
    }
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

  async getProctoringEventsForLabTest(labTestId: string, teacherUserId: string) {
    const labTest = await this.labTestRepo.findOneBy({ id: labTestId });
    if (!labTest) throw new NotFoundException('Lab test not found');
    await this.getTeacherCourseAccess(labTest.courseId, teacherUserId);

    return this.proctoringEventRepo.find({
      where: { labTestId },
      relations: ['student'],
      order: { createdAt: 'DESC' },
      take: 100,
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

    const courses = await this.courseRepo.find({
      where: courseIds.map((courseId) => ({ id: courseId })),
      relations: ['semester', 'schedules'],
    });
    const sectionByCourseId = new Map<string, string>();
    for (const course of courses) {
      const batchSections = await this.getCourseBatchSections(course);
      sectionByCourseId.set(course.id, this.resolveStudentSection(student, batchSections));
    }

    const activities = await this.labTestRepo
      .createQueryBuilder('labTest')
      .where('labTest.courseId IN (:...courseIds)', { courseIds })
      .orderBy('labTest.createdAt', 'DESC')
      .getMany();
    await this.syncExpiredActivities(activities);

    return activities.filter((labTest) => {
      if (labTest.status !== LabTestStatus.RUNNING) {
        return false;
      }

      const scopedSectionName = labTest.sectionName
        ? normalizeSectionName(labTest.sectionName)
        : null;
      if (!scopedSectionName || scopedSectionName === 'All Students') {
        return true;
      }

      return scopedSectionName === sectionByCourseId.get(labTest.courseId);
    });
  }

  async getProblemsForStudent(labTestId: string, studentUserId: string): Promise<any[]> {
    const labTest = await this.getLabTestById(labTestId);
    await this.ensureStudentCanAccessLabTest(labTest, studentUserId);
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
    const { student } = await this.ensureStudentCanAccessLabTest(labTest, studentUserId);
    const problems = await this.problemRepo.findBy({ labTestId });
    const problemIds = problems.map((problem) => problem.id);
    if (!problemIds.length) return [];

    return this.submissionRepo.find({
      where: problemIds.map((problemId) => ({ problemId, studentId: student.id })),
      relations: ['problem'],
      order: { submittedAt: 'DESC' },
    });
  }

  async reportProctoringEvent(
    labTestId: string,
    studentUserId: string,
    dto: ReportLabProctoringEventDto,
  ) {
    const labTest = await this.labTestRepo.findOne({
      where: { id: labTestId },
      relations: ['course', 'course.teachers'],
    });
    if (!labTest) throw new NotFoundException('Lab activity not found');

    const { student } = await this.ensureStudentCanAccessLabTest(
      labTest,
      studentUserId,
    );
    await this.syncExpiredActivities([labTest]);

    const now = new Date();
    if (
      labTest.status !== LabTestStatus.RUNNING ||
      !labTest.startTime ||
      !labTest.endTime ||
      now < labTest.startTime ||
      now > labTest.endTime
    ) {
      throw new ForbiddenException('Lab activity is not currently running');
    }

    if (dto.problemId) {
      const problem = await this.problemRepo.findOneBy({
        id: dto.problemId,
        labTestId,
      });
      if (!problem) {
        throw new BadRequestException('Problem does not belong to this lab activity');
      }
    }

    const duplicateSince = new Date(Date.now() - 8000);
    const recentDuplicate = await this.proctoringEventRepo
      .createQueryBuilder('event')
      .where('event.labTestId = :labTestId', { labTestId })
      .andWhere('event.studentId = :studentId', { studentId: student.id })
      .andWhere('event.eventType = :eventType', { eventType: dto.eventType })
      .andWhere('event.createdAt >= :duplicateSince', { duplicateSince })
      .orderBy('event.createdAt', 'DESC')
      .getOne();

    if (recentDuplicate) {
      return recentDuplicate;
    }

    const savedEvent = await this.proctoringEventRepo.save(
      this.proctoringEventRepo.create({
        labTestId,
        studentId: student.id,
        eventType: dto.eventType,
        problemId: dto.problemId ?? null,
        message: dto.message?.trim() || null,
        metadata: {
          activityKind: labTest.activityKind,
          activityTitle: this.getActivityLabel(labTest),
        },
      }),
    );

    const teacherUserIds = Array.from(
      new Set(
        (labTest.course?.teachers ?? [])
          .map((teacher) => teacher.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    if (teacherUserIds.length) {
      await this.notifications.createBulk(teacherUserIds, {
        type: NotificationType.SYSTEM,
        title: `Proctoring alert in ${this.getActivityLabel(labTest)}`,
        body: `${
          student.fullName || student.studentId
        } ${this.describeProctoringEvent(dto.eventType)}.`,
        referenceId: savedEvent.id,
        targetPath: this.buildTeacherActivityHref(labTest),
      });
    }

    return savedEvent;
  }

  async runCode(problemId: string, studentUserId: string, dto: RunLabCodeDto) {
    const problem = await this.problemRepo.findOne({
      where: { id: problemId },
      relations: ['labTest'],
    });
    if (!problem) throw new NotFoundException('Problem not found');

    await this.ensureStudentCanAccessLabTest(problem.labTest, studentUserId);
    await this.syncExpiredActivities([problem.labTest]);

    const sourceCode = dto.code?.trim();
    if (!sourceCode) {
      throw new BadRequestException('Code is required to run the solution');
    }
    if (!dto.language) {
      throw new BadRequestException('Language is required');
    }
    if (
      problem.labTest.status !== LabTestStatus.RUNNING ||
      !problem.labTest.startTime ||
      !problem.labTest.endTime ||
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

    const { student } = await this.ensureStudentCanAccessLabTest(
      problem.labTest,
      studentUserId,
    );
    await this.syncExpiredActivities([problem.labTest]);

    const now = new Date();
    if (problem.labTest.status !== LabTestStatus.RUNNING) {
      throw new ForbiddenException('Lab activity is not currently running');
    }
    if (!problem.labTest.startTime || !problem.labTest.endTime) {
      throw new ForbiddenException('Submission window closed');
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
    const { student } = await this.ensureStudentCanAccessLabTest(
      problem.labTest,
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

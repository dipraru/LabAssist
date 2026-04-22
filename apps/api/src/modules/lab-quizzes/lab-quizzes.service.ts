import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../../common/enums/role.enum';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { LabClass } from '../courses/entities/lab-class.entity';
import { Batch, BatchSection } from '../office/entities/batch.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { LabProctoringEventType } from '../lab-tests/entities/lab-proctoring-event.entity';
import {
  CreateLabQuizDto,
  CreateLabQuizQuestionDto,
  GradeLabQuizAttemptDto,
  ReportLabQuizProctoringEventDto,
  SubmitLabQuizDto,
  UpdateLabQuizDto,
  UpdateLabQuizQuestionDto,
} from './dto/lab-quizzes.dto';
import {
  LabQuiz,
  LabQuizQuestionDisplayMode,
  LabQuizStatus,
} from './entities/lab-quiz.entity';
import {
  LabQuizAttempt,
  LabQuizAttemptAnswer,
} from './entities/lab-quiz-attempt.entity';
import {
  LabQuizOption,
  LabQuizQuestion,
  LabQuizQuestionType,
} from './entities/lab-quiz-question.entity';
import { LabQuizProctoringEvent } from './entities/lab-quiz-proctoring-event.entity';
import { LabQuizReportPdfService } from './lab-quiz-report-pdf.service';

function normalizeSectionName(sectionName?: string | null): string {
  const normalized = sectionName?.trim();
  if (!normalized) return 'All Students';
  if (['all', 'all section', 'all sections'].includes(normalized.toLowerCase())) {
    return 'All Students';
  }
  return normalized;
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

function numericScore(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class LabQuizzesService {
  constructor(
    @InjectRepository(LabQuiz) private quizRepo: Repository<LabQuiz>,
    @InjectRepository(LabQuizQuestion)
    private questionRepo: Repository<LabQuizQuestion>,
    @InjectRepository(LabQuizAttempt)
    private attemptRepo: Repository<LabQuizAttempt>,
    @InjectRepository(LabQuizProctoringEvent)
    private proctoringEventRepo: Repository<LabQuizProctoringEvent>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(LabClass) private labClassRepo: Repository<LabClass>,
    private notifications: NotificationsService,
    private reportPdf: LabQuizReportPdfService,
  ) {}

  private async getTeacherCourseAccess(
    courseId: string,
    teacherUserId: string,
  ) {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['teachers', 'semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const assigned = (course.teachers ?? []).some(
      (item) => item.id === teacher.id,
    );
    if (!assigned) {
      throw new ForbiddenException('You are not assigned to this course');
    }

    return { teacher, course };
  }

  private async getCourseBatchSections(
    course: Course,
  ): Promise<BatchSection[]> {
    if (!(course as Course & { semester?: any })?.semester?.batchYear) {
      return [];
    }

    const batch = await this.batchRepo.findOne({
      where: {
        year: (course as Course & { semester?: any }).semester.batchYear,
      },
    });

    return batch?.sections ?? [];
  }

  private async getCourseSectionNames(course: Course): Promise<string[]> {
    const batchSections = await this.getCourseBatchSections(course);
    const batchNames = batchSections.map((section) =>
      normalizeSectionName(section.name),
    );
    const scheduleNames = Array.isArray(
      (course as Course & { schedules?: any[] }).schedules,
    )
      ? ((course as Course & { schedules?: any[] }).schedules ?? []).map(
          (schedule: any) => normalizeSectionName(schedule?.sectionName),
        )
      : [];

    const values = ['All Students', ...batchNames, ...scheduleNames].filter(
      Boolean,
    );
    return Array.from(new Set(values));
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

  private async validateQuizPlacement(
    course: Course,
    sectionName?: string | null,
    labClassId?: string | null,
  ): Promise<{ sectionName: string; labClassId: string | null }> {
    const normalizedSectionName = normalizeSectionName(sectionName);
    const sectionNames = await this.getCourseSectionNames(course);

    if (
      normalizedSectionName !== 'All Students' &&
      !sectionNames.includes(normalizedSectionName)
    ) {
      throw new BadRequestException('Invalid section for this course');
    }

    if (!labClassId) {
      return { sectionName: normalizedSectionName, labClassId: null };
    }

    const labClass = await this.labClassRepo.findOne({
      where: { id: labClassId },
      relations: ['sections'],
    });
    if (!labClass || labClass.courseId !== course.id) {
      throw new BadRequestException('Invalid lab class for this course');
    }

    if (
      normalizedSectionName !== 'All Students' &&
      !(labClass.sections ?? []).some(
        (section) =>
          normalizeSectionName(section.sectionName) === normalizedSectionName,
      )
    ) {
      throw new BadRequestException('Selected lab class does not have this section');
    }

    return { sectionName: normalizedSectionName, labClassId: labClass.id };
  }

  private resolveBooleanFlag(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['false', '0', 'off', 'no'].includes(normalized)) return false;
      if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    }
    return Boolean(value);
  }

  private buildMcqOptions(optionTexts: string[] | undefined): LabQuizOption[] {
    const options = (optionTexts ?? [])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: uuidv4(), text }));

    if (options.length < 2) {
      throw new BadRequestException('MCQ questions require at least two options');
    }

    return options;
  }

  private buildQuestionValues(
    dto: CreateLabQuizQuestionDto,
  ): Partial<LabQuizQuestion> {
    const prompt = dto.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('Question prompt is required');
    }

    const marks = dto.marks ?? 1;
    if (!Number.isFinite(marks) || marks < 0) {
      throw new BadRequestException('Question marks must be a positive number');
    }

    if (dto.questionType === LabQuizQuestionType.MCQ) {
      const options = this.buildMcqOptions(dto.options);
      if (
        dto.correctOptionIndex === undefined ||
        dto.correctOptionIndex < 0 ||
        dto.correctOptionIndex >= options.length
      ) {
        throw new BadRequestException('Select the correct MCQ answer');
      }

      return {
        questionType: LabQuizQuestionType.MCQ,
        prompt,
        options,
        correctOptionId: options[dto.correctOptionIndex].id,
        answerKey: null,
        marks,
      };
    }

    return {
      questionType: LabQuizQuestionType.SHORT_ANSWER,
      prompt,
      options: [],
      correctOptionId: null,
      answerKey: dto.answerKey?.trim() || null,
      marks,
    };
  }

  private applyQuestionUpdate(
    question: LabQuizQuestion,
    dto: UpdateLabQuizQuestionDto,
  ) {
    const nextType = dto.questionType ?? question.questionType;
    if (dto.prompt !== undefined) {
      const prompt = dto.prompt.trim();
      if (!prompt) {
        throw new BadRequestException('Question prompt is required');
      }
      question.prompt = prompt;
    }
    if (dto.marks !== undefined) {
      if (!Number.isFinite(dto.marks) || dto.marks < 0) {
        throw new BadRequestException('Question marks must be a positive number');
      }
      question.marks = dto.marks;
    }

    if (nextType === LabQuizQuestionType.MCQ) {
      const options =
        dto.options !== undefined
          ? this.buildMcqOptions(dto.options)
          : question.options ?? [];
      if (options.length < 2) {
        throw new BadRequestException('MCQ questions require at least two options');
      }
      const correctIndex =
        dto.correctOptionIndex ??
        options.findIndex((option) => option.id === question.correctOptionId);
      if (correctIndex < 0 || correctIndex >= options.length) {
        throw new BadRequestException('Select the correct MCQ answer');
      }

      question.questionType = LabQuizQuestionType.MCQ;
      question.options = options;
      question.correctOptionId = options[correctIndex].id;
      question.answerKey = null;
      return;
    }

    question.questionType = LabQuizQuestionType.SHORT_ANSWER;
    question.options = [];
    question.correctOptionId = null;
    if (dto.answerKey !== undefined || question.questionType !== nextType) {
      question.answerKey = dto.answerKey?.trim() || null;
    }
  }

  private applyQuestionAnswerUpdate(
    question: LabQuizQuestion,
    dto: UpdateLabQuizQuestionDto,
  ) {
    if (
      dto.questionType !== undefined ||
      dto.prompt !== undefined ||
      dto.options !== undefined ||
      dto.marks !== undefined
    ) {
      throw new BadRequestException(
        'Only the answer can be changed after the quiz starts',
      );
    }

    if (question.questionType === LabQuizQuestionType.MCQ) {
      if (dto.answerKey !== undefined) {
        throw new BadRequestException('MCQ answer must be selected from options');
      }
      if (dto.correctOptionIndex === undefined) {
        throw new BadRequestException('Select the correct MCQ answer');
      }
      const options = question.options ?? [];
      if (
        dto.correctOptionIndex < 0 ||
        dto.correctOptionIndex >= options.length
      ) {
        throw new BadRequestException('Select the correct MCQ answer');
      }
      question.correctOptionId = options[dto.correctOptionIndex].id;
      return;
    }

    if (dto.correctOptionIndex !== undefined) {
      throw new BadRequestException('Short answer questions use an answer key');
    }
    question.answerKey = dto.answerKey?.trim() || null;
  }

  private async recalculateSubmittedAttempts(
    quizId: string,
    questions: LabQuizQuestion[],
    teacherUserId?: string,
  ) {
    const attempts = await this.attemptRepo.find({ where: { quizId } });
    for (const attempt of attempts) {
      if (!attempt.submittedAt) continue;
      const evaluated = this.calculateAttemptEvaluation(
        attempt,
        questions,
        teacherUserId,
      );
      await this.attemptRepo.save(evaluated);
    }
  }

  private getQuestionMarksTotal(questions: LabQuizQuestion[]): number {
    return questions.reduce((sum, question) => sum + Number(question.marks ?? 0), 0);
  }

  private deterministicWeight(key: string): number {
    return createHash('sha256').update(key).digest().readUInt32BE(0);
  }

  private deterministicShuffle<T extends { id: string }>(
    items: T[],
    seed: string,
  ): T[] {
    return [...items]
      .map((item) => ({
        item,
        weight: this.deterministicWeight(`${seed}:${item.id}`),
      }))
      .sort((left, right) => left.weight - right.weight)
      .map((entry) => entry.item);
  }

  private async syncExpiredQuizzes(quizzes: LabQuiz[]): Promise<void> {
    const expired = quizzes.filter(
      (quiz) =>
        quiz.status === LabQuizStatus.RUNNING &&
        quiz.endTime &&
        new Date(quiz.endTime).getTime() <= Date.now(),
    );
    if (!expired.length) return;

    for (const quiz of expired) {
      await this.finishQuiz(quiz.id, quiz.endTime ?? new Date());
      quiz.status = LabQuizStatus.ENDED;
    }
  }

  private async getQuizWithQuestions(id: string): Promise<LabQuiz> {
    const quiz = await this.quizRepo.findOne({
      where: { id },
      relations: ['questions'],
      order: { questions: { orderIndex: 'ASC' } } as any,
    });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.syncExpiredQuizzes([quiz]);
    return quiz;
  }

  private async getPresentSectionsByStudentId(
    quiz: Pick<LabQuiz, 'courseId' | 'labClassId' | 'sectionName'>,
  ): Promise<Map<string, Set<string>>> {
    if (!quiz.labClassId) return new Map();

    const labClass = await this.labClassRepo.findOne({
      where: { id: quiz.labClassId },
      relations: ['sections'],
    });
    if (!labClass || labClass.courseId !== quiz.courseId) {
      return new Map();
    }

    const scopedSectionName = normalizeSectionName(quiz.sectionName);
    const presentSectionsByStudentId = new Map<string, Set<string>>();

    for (const section of labClass.sections ?? []) {
      const sectionName = normalizeSectionName(section.sectionName);
      if (scopedSectionName !== 'All Students' && sectionName !== scopedSectionName) {
        continue;
      }

      for (const record of section.attendanceRecords ?? []) {
        if (!record.isPresent) continue;
        if (!presentSectionsByStudentId.has(record.studentId)) {
          presentSectionsByStudentId.set(record.studentId, new Set());
        }
        presentSectionsByStudentId.get(record.studentId)?.add(sectionName);
      }
    }

    return presentSectionsByStudentId;
  }

  private async ensureStudentCanAccessQuiz(
    quiz: LabQuiz,
    studentUserId: string,
  ): Promise<{ student: Student; sectionName: string }> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { courseId: quiz.courseId, studentId: student.id, isActive: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    const course = await this.courseRepo.findOne({
      where: { id: quiz.courseId },
      relations: ['semester'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const batchSections = await this.getCourseBatchSections(course);
    const sectionName = normalizeSectionName(
      this.resolveStudentSection(student, batchSections),
    );
    const quizSectionName = normalizeSectionName(quiz.sectionName);
    if (quiz.labClassId) {
      const presentSectionsByStudentId =
        await this.getPresentSectionsByStudentId(quiz);
      const presentSections = presentSectionsByStudentId.get(student.id);
      if (!presentSections?.size) {
        throw new ForbiddenException(
          'Only students present in the selected lab can access this quiz',
        );
      }
      if (
        quizSectionName !== 'All Students' &&
        !presentSections.has(quizSectionName)
      ) {
        throw new ForbiddenException('This lab quiz is not assigned to your section');
      }

      return {
        student,
        sectionName:
          quizSectionName === 'All Students'
            ? Array.from(presentSections)[0] ?? sectionName
            : quizSectionName,
      };
    }

    if (quizSectionName !== 'All Students' && sectionName !== quizSectionName) {
      throw new ForbiddenException('This lab quiz is not assigned to your section');
    }

    return { student, sectionName };
  }

  private async getEligibleStudentRows(quiz: LabQuiz): Promise<
    {
      student: Student;
      sectionName: string;
    }[]
  > {
    const course = await this.courseRepo.findOne({
      where: { id: quiz.courseId },
      relations: ['semester'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const batchSections = await this.getCourseBatchSections(course);
    const scopedSectionName = normalizeSectionName(quiz.sectionName);
    if (quiz.labClassId) {
      const presentSectionsByStudentId =
        await this.getPresentSectionsByStudentId(quiz);
      const presentStudentIds = Array.from(presentSectionsByStudentId.keys());
      if (!presentStudentIds.length) return [];

      const enrollments = await this.enrollmentRepo.find({
        where: {
          courseId: quiz.courseId,
          studentId: In(presentStudentIds),
          isActive: true,
        },
        relations: ['student'],
      });

      return enrollments
        .map((enrollment) => {
          const presentSections = presentSectionsByStudentId.get(
            enrollment.studentId,
          );
          return {
            student: enrollment.student,
            sectionName:
              scopedSectionName === 'All Students'
                ? Array.from(presentSections ?? [])[0] ?? 'All Students'
                : scopedSectionName,
          };
        })
        .filter((row) => Boolean(row.student))
        .sort((left, right) =>
          String(left.student.studentId).localeCompare(
            String(right.student.studentId),
          ),
        );
    }

    const enrollments = await this.enrollmentRepo.find({
      where: { courseId: quiz.courseId, isActive: true },
      relations: ['student'],
    });

    return enrollments
      .map((enrollment) => ({
        student: enrollment.student,
        sectionName: normalizeSectionName(
          this.resolveStudentSection(enrollment.student, batchSections),
        ),
      }))
      .filter(
        (row) =>
          scopedSectionName === 'All Students' ||
          row.sectionName === scopedSectionName,
      )
      .sort((left, right) =>
        String(left.student.studentId).localeCompare(String(right.student.studentId)),
      );
  }

  private async ensureAttempt(
    quiz: LabQuiz,
    student: Student,
    questions: LabQuizQuestion[],
  ): Promise<LabQuizAttempt> {
    let attempt = await this.attemptRepo.findOne({
      where: { quizId: quiz.id, studentId: student.id },
    });

    if (!attempt) {
      const order = this.deterministicShuffle(
        questions,
        `${quiz.id}:${student.id}:questions`,
      ).map((question) => question.id);
      attempt = this.attemptRepo.create({
        quizId: quiz.id,
        studentId: student.id,
        questionOrder: order,
        answers: [],
        mcqScore: null,
        shortScore: null,
        totalScore: null,
        evaluationComplete: false,
      });
      attempt = await this.attemptRepo.save(attempt);
    }

    const knownIds = new Set(attempt.questionOrder ?? []);
    const missingQuestionIds = questions
      .filter((question) => !knownIds.has(question.id))
      .map((question) => question.id);
    if (missingQuestionIds.length) {
      attempt.questionOrder = [...(attempt.questionOrder ?? []), ...missingQuestionIds];
      attempt = await this.attemptRepo.save(attempt);
    }

    return attempt;
  }

  private orderQuestionsForAttempt(
    quiz: LabQuiz,
    student: Student,
    attempt: LabQuizAttempt,
    questions: LabQuizQuestion[],
  ) {
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const ordered = (attempt.questionOrder ?? [])
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is LabQuizQuestion => Boolean(question));
    const missing = questions.filter(
      (question) => !ordered.some((item) => item.id === question.id),
    );

    return [...ordered, ...missing].map((question) => ({
      ...question,
      options:
        question.questionType === LabQuizQuestionType.MCQ
          ? this.deterministicShuffle(
              question.options ?? [],
              `${quiz.id}:${student.id}:${question.id}:options`,
            )
          : [],
      correctOptionId: undefined,
      answerKey: undefined,
    }));
  }

  private sanitizeAttempt(attempt: LabQuizAttempt, includeScores: boolean) {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      studentId: attempt.studentId,
      submittedAt: attempt.submittedAt,
      evaluationComplete: attempt.evaluationComplete,
      mcqScore: includeScores ? attempt.mcqScore : null,
      shortScore: includeScores ? attempt.shortScore : null,
      totalScore: includeScores ? attempt.totalScore : null,
      answers: (attempt.answers ?? []).map((answer) => ({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId ?? null,
        answerText: answer.answerText ?? null,
        score: includeScores ? (answer.score ?? null) : null,
        evaluated: includeScores ? Boolean(answer.evaluated) : false,
        teacherNote: includeScores ? (answer.teacherNote ?? null) : null,
      })),
    };
  }

  private calculateAttemptEvaluation(
    attempt: LabQuizAttempt,
    questions: LabQuizQuestion[],
    teacherUserId?: string,
  ): LabQuizAttempt {
    const answersByQuestionId = new Map(
      (attempt.answers ?? []).map((answer) => [answer.questionId, answer]),
    );
    let mcqScore = 0;
    let shortScore = 0;
    let complete = true;
    const now = new Date().toISOString();

    const nextAnswers: LabQuizAttemptAnswer[] = questions.map((question) => {
      const existing = answersByQuestionId.get(question.id) ?? {
        questionId: question.id,
      };

      if (!attempt.submittedAt) {
        return {
          ...existing,
          questionId: question.id,
          score: 0,
          evaluated: true,
          evaluatedAt: now,
          evaluatedById: teacherUserId ?? existing.evaluatedById ?? null,
        };
      }

      if (question.questionType === LabQuizQuestionType.MCQ) {
        const score =
          existing.selectedOptionId &&
          existing.selectedOptionId === question.correctOptionId
            ? Number(question.marks ?? 0)
            : 0;
        mcqScore += score;
        return {
          ...existing,
          questionId: question.id,
          answerText: null,
          score,
          evaluated: true,
          evaluatedAt: now,
        };
      }

      const submittedAnswer = existing.answerText?.trim() ?? '';
      if (!submittedAnswer) {
        shortScore += 0;
        return {
          ...existing,
          questionId: question.id,
          score: 0,
          evaluated: true,
          evaluatedAt: now,
          evaluatedById: teacherUserId ?? existing.evaluatedById ?? null,
        };
      }

      const manualScore = numericScore(existing.score);
      const evaluated = Boolean(existing.evaluated) && manualScore !== null;
      if (!evaluated) {
        complete = false;
        return {
          ...existing,
          questionId: question.id,
          score: null,
          evaluated: false,
        };
      }

      shortScore += manualScore;
      return {
        ...existing,
        questionId: question.id,
        score: manualScore,
        evaluated: true,
      };
    });

    attempt.answers = nextAnswers;
    attempt.mcqScore = Number(mcqScore.toFixed(2));
    attempt.shortScore = Number(shortScore.toFixed(2));
    attempt.totalScore = Number((mcqScore + shortScore).toFixed(2));
    attempt.evaluationComplete = complete;
    return attempt;
  }

  private async finishQuiz(quizId: string, endedAt = new Date()): Promise<LabQuiz> {
    const quiz = await this.quizRepo.findOne({
      where: { id: quizId },
      relations: ['questions'],
    });
    if (!quiz) throw new NotFoundException('Lab quiz not found');

    quiz.status = LabQuizStatus.ENDED;
    quiz.endTime = endedAt;
    if (!quiz.startTime) {
      quiz.startTime = endedAt;
    }
    const saved = await this.quizRepo.save(quiz);

    const attempts = await this.attemptRepo.find({ where: { quizId } });
    for (const attempt of attempts) {
      const evaluated = this.calculateAttemptEvaluation(
        attempt,
        quiz.questions ?? [],
      );
      await this.attemptRepo.save(evaluated);
    }

    return saved;
  }

  private async notifyStudentsAboutQuizStart(quiz: LabQuiz) {
    const eligibleRows = await this.getEligibleStudentRows(quiz);
    const recipientUserIds = Array.from(
      new Set(
        eligibleRows
          .map((row) => row.student.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    if (!recipientUserIds.length) return;

    await this.notifications.createBulk(recipientUserIds, {
      type: NotificationType.SYSTEM,
      title: `Lab Quiz Started: ${quiz.title}`,
      body: 'Your running lab quiz is ready.',
      referenceId: quiz.id,
      targetPath: `/student/lab-quizzes/${quiz.id}`,
    });
  }

  private describeProctoringEvent(eventType: LabProctoringEventType): string {
    switch (eventType) {
      case LabProctoringEventType.FULLSCREEN_EXIT:
        return 'left fullscreen mode';
      case LabProctoringEventType.TAB_HIDDEN:
        return 'switched away from the lab quiz tab';
      case LabProctoringEventType.WINDOW_BLUR:
        return 'moved focus away from the lab quiz window';
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

  async createQuiz(dto: CreateLabQuizDto, teacherUserId: string) {
    const { course } = await this.getTeacherCourseAccess(
      dto.courseId,
      teacherUserId,
    );
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Title is required');

    const placement = await this.validateQuizPlacement(
      course,
      dto.sectionName,
      dto.labClassId,
    );
    const quiz = await this.quizRepo.save(
      this.quizRepo.create({
        courseId: dto.courseId,
        title,
        description: dto.description?.trim() || null,
        durationMinutes: dto.durationMinutes,
        totalMarks: dto.totalMarks ?? null,
        sectionName: placement.sectionName,
        labClassId: placement.labClassId,
        questionDisplayMode:
          dto.questionDisplayMode ?? LabQuizQuestionDisplayMode.ALL,
        proctoringEnabled: this.resolveBooleanFlag(dto.proctoringEnabled, true),
        status: LabQuizStatus.DRAFT,
        startTime: null,
        endTime: null,
      }),
    );

    for (const [index, questionDto] of (dto.questions ?? []).entries()) {
      await this.questionRepo.save(
        this.questionRepo.create({
          ...this.buildQuestionValues(questionDto),
          quizId: quiz.id,
          orderIndex: index + 1,
        }),
      );
    }

    return this.getQuizByIdForTeacher(quiz.id, teacherUserId);
  }

  async updateQuiz(
    quizId: string,
    dto: UpdateLabQuizDto,
    teacherUserId: string,
  ) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    const { course } = await this.getTeacherCourseAccess(
      quiz.courseId,
      teacherUserId,
    );
    await this.syncExpiredQuizzes([quiz]);
    if (quiz.status !== LabQuizStatus.DRAFT) {
      throw new BadRequestException('Only draft quizzes can be edited');
    }

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Title is required');
      quiz.title = title;
    }
    if (dto.description !== undefined) {
      quiz.description = dto.description?.trim() || null;
    }
    if (dto.durationMinutes !== undefined) {
      quiz.durationMinutes = dto.durationMinutes;
    }
    if (dto.totalMarks !== undefined) {
      quiz.totalMarks = dto.totalMarks ?? null;
    }
    if (dto.questionDisplayMode !== undefined) {
      quiz.questionDisplayMode = dto.questionDisplayMode;
    }
    if (dto.sectionName !== undefined || dto.labClassId !== undefined) {
      const placement = await this.validateQuizPlacement(
        course,
        dto.sectionName ?? quiz.sectionName,
        dto.labClassId !== undefined ? dto.labClassId : quiz.labClassId,
      );
      quiz.sectionName = placement.sectionName;
      quiz.labClassId = placement.labClassId;
    }
    if (dto.proctoringEnabled !== undefined) {
      quiz.proctoringEnabled = this.resolveBooleanFlag(dto.proctoringEnabled, true);
    }

    return this.quizRepo.save(quiz);
  }

  async getQuizzesByCourse(
    courseId: string,
    requesterUserId: string,
    role: UserRole,
    sectionName?: string,
  ) {
    if (role === UserRole.TEACHER) {
      await this.getTeacherCourseAccess(courseId, requesterUserId);
    }

    const where: Record<string, any> = { courseId };
    if (sectionName?.trim()) {
      where.sectionName = normalizeSectionName(sectionName);
    }

    const quizzes = await this.quizRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    await this.syncExpiredQuizzes(quizzes);

    if (role === UserRole.STUDENT) {
      const visible: LabQuiz[] = [];
      for (const quiz of quizzes) {
        if (quiz.status === LabQuizStatus.DRAFT) continue;
        try {
          await this.ensureStudentCanAccessQuiz(quiz, requesterUserId);
          visible.push(quiz);
        } catch {
          continue;
        }
      }
      return visible;
    }

    return quizzes;
  }

  async getQuizByIdForTeacher(id: string, teacherUserId: string) {
    const quiz = await this.getQuizWithQuestions(id);
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    return quiz;
  }

  async getQuizSession(id: string, studentUserId: string) {
    const quiz = await this.getQuizWithQuestions(id);
    if (quiz.status === LabQuizStatus.DRAFT) {
      throw new ForbiddenException('Lab quiz has not started');
    }
    const { student } = await this.ensureStudentCanAccessQuiz(quiz, studentUserId);
    const questions = [...(quiz.questions ?? [])].sort(
      (left, right) => left.orderIndex - right.orderIndex,
    );
    const attempt = await this.ensureAttempt(quiz, student, questions);
    const orderedQuestions = this.orderQuestionsForAttempt(
      quiz,
      student,
      attempt,
      questions,
    );

    return {
      quiz: {
        ...quiz,
        questions: orderedQuestions,
      },
      attempt: this.sanitizeAttempt(attempt, quiz.status === LabQuizStatus.ENDED),
    };
  }

  async addQuestion(
    quizId: string,
    dto: CreateLabQuizQuestionDto,
    teacherUserId: string,
  ) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status !== LabQuizStatus.DRAFT) {
      throw new BadRequestException('Questions can be changed only in draft');
    }

    const count = await this.questionRepo.count({ where: { quizId } });
    const question = this.questionRepo.create({
      ...this.buildQuestionValues(dto),
      quizId,
      orderIndex: count + 1,
    });
    return this.questionRepo.save(question);
  }

  async updateQuestion(
    quizId: string,
    questionId: string,
    dto: UpdateLabQuizQuestionDto,
    teacherUserId: string,
  ) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);

    const question = await this.questionRepo.findOneBy({ id: questionId, quizId });
    if (!question) throw new NotFoundException('Question not found');
    if (quiz.status === LabQuizStatus.DRAFT) {
      this.applyQuestionUpdate(question, dto);
      return this.questionRepo.save(question);
    }

    this.applyQuestionAnswerUpdate(question, dto);
    const saved = await this.questionRepo.save(question);
    if (quiz.status === LabQuizStatus.ENDED) {
      const questions = await this.questionRepo.find({
        where: { quizId },
        order: { orderIndex: 'ASC' },
      });
      await this.recalculateSubmittedAttempts(quizId, questions, teacherUserId);
    }
    return saved;
  }

  async removeQuestion(
    quizId: string,
    questionId: string,
    teacherUserId: string,
  ) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status !== LabQuizStatus.DRAFT) {
      throw new BadRequestException('Questions can be changed only in draft');
    }

    const question = await this.questionRepo.findOneBy({ id: questionId, quizId });
    if (!question) throw new NotFoundException('Question not found');
    await this.questionRepo.remove(question);

    const remaining = await this.questionRepo.find({
      where: { quizId },
      order: { orderIndex: 'ASC' },
    });
    for (const [index, item] of remaining.entries()) {
      item.orderIndex = index + 1;
      await this.questionRepo.save(item);
    }

    return { success: true };
  }

  async startQuiz(quizId: string, teacherUserId: string) {
    const quiz = await this.getQuizWithQuestions(quizId);
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status === LabQuizStatus.ENDED) {
      throw new BadRequestException('Ended quiz cannot be started again');
    }
    if (quiz.status === LabQuizStatus.RUNNING) {
      return quiz;
    }
    if (!(quiz.questions ?? []).length) {
      throw new BadRequestException('Add at least one question before starting');
    }
    const questionMarksTotal = this.getQuestionMarksTotal(quiz.questions ?? []);
    const configuredTotal = numericScore(quiz.totalMarks);
    if (configuredTotal === null) {
      throw new BadRequestException('Set total marks before starting the quiz');
    }
    if (Math.abs(configuredTotal - questionMarksTotal) > 0.001) {
      throw new BadRequestException(
        `Total marks (${configuredTotal}) must match question marks (${questionMarksTotal})`,
      );
    }

    const startTime = new Date();
    quiz.status = LabQuizStatus.RUNNING;
    quiz.startTime = startTime;
    quiz.endTime = new Date(startTime.getTime() + quiz.durationMinutes * 60_000);
    const saved = await this.quizRepo.save(quiz);
    await this.notifyStudentsAboutQuizStart(saved);
    return saved;
  }

  async endQuiz(quizId: string, teacherUserId: string) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status !== LabQuizStatus.RUNNING) {
      throw new BadRequestException('Only running quizzes can be ended');
    }
    return this.finishQuiz(quizId, new Date());
  }

  async submitQuiz(
    quizId: string,
    studentUserId: string,
    dto: SubmitLabQuizDto,
  ) {
    const quiz = await this.getQuizWithQuestions(quizId);
    const { student } = await this.ensureStudentCanAccessQuiz(quiz, studentUserId);
    if (!quiz.startTime || !quiz.endTime) {
      throw new ForbiddenException('Lab quiz is not currently running');
    }
    const now = new Date();
    const allowedDeadline = new Date(quiz.endTime.getTime() + 30_000);
    const canSubmit =
      (quiz.status === LabQuizStatus.RUNNING && now >= quiz.startTime) ||
      (quiz.status === LabQuizStatus.ENDED && now <= allowedDeadline);
    if (!canSubmit || now > allowedDeadline) {
      throw new ForbiddenException('Submission window closed');
    }

    const questions = [...(quiz.questions ?? [])];
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const incoming = new Map((dto.answers ?? []).map((answer) => [answer.questionId, answer]));
    const attempt = await this.ensureAttempt(quiz, student, questions);
    if (attempt.submittedAt) {
      return this.sanitizeAttempt(attempt, quiz.status === LabQuizStatus.ENDED);
    }
    attempt.answers = questions.map((question) => {
      const answer = incoming.get(question.id);
      if (question.questionType === LabQuizQuestionType.MCQ) {
        const selectedOptionId = answer?.selectedOptionId ?? null;
        if (
          selectedOptionId &&
          !(question.options ?? []).some((option) => option.id === selectedOptionId)
        ) {
          throw new BadRequestException('Invalid answer option submitted');
        }
        return {
          questionId: question.id,
          selectedOptionId,
          answerText: null,
          score: null,
          evaluated: false,
        };
      }

      return {
        questionId: question.id,
        selectedOptionId: null,
        answerText: answer?.answerText?.trim() || null,
        score: null,
        evaluated: false,
      };
    });

    for (const questionId of incoming.keys()) {
      if (!questionById.has(questionId)) {
        throw new BadRequestException('Submitted answer contains an invalid question');
      }
    }

    attempt.submittedAt = now;
    attempt.mcqScore = null;
    attempt.shortScore = null;
    attempt.totalScore = null;
    attempt.evaluationComplete = false;
    const saved = await this.attemptRepo.save(attempt);
    if (quiz.status === LabQuizStatus.ENDED) {
      const evaluated = this.calculateAttemptEvaluation(saved, questions);
      return this.sanitizeAttempt(await this.attemptRepo.save(evaluated), true);
    }
    return this.sanitizeAttempt(saved, false);
  }

  async getAttemptsForTeacher(quizId: string, teacherUserId: string) {
    const quiz = await this.getQuizWithQuestions(quizId);
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    const eligibleRows = await this.getEligibleStudentRows(quiz);
    const attempts = await this.attemptRepo.find({
      where: { quizId },
      relations: ['student'],
    });
    const attemptByStudentId = new Map(
      attempts.map((attempt) => [attempt.studentId, attempt]),
    );
    const questions = quiz.questions ?? [];
    const hasShortQuestions = questions.some(
      (question) => question.questionType === LabQuizQuestionType.SHORT_ANSWER,
    );

    return {
      quiz,
      questions,
      canDownloadReport:
        quiz.status === LabQuizStatus.ENDED &&
        (!hasShortQuestions ||
          attempts.every(
            (attempt) => !attempt.submittedAt || attempt.evaluationComplete,
          )),
      rows: eligibleRows.map((row) => {
        const attempt = attemptByStudentId.get(row.student.id);
        return {
          student: row.student,
          sectionName: row.sectionName,
          attempt: attempt
            ? this.sanitizeAttempt(attempt, true)
            : {
                submittedAt: null,
                evaluationComplete: true,
                mcqScore: 0,
                shortScore: 0,
                totalScore: 0,
                answers: [],
              },
        };
      }),
    };
  }

  async gradeAttempt(
    quizId: string,
    attemptId: string,
    dto: GradeLabQuizAttemptDto,
    teacherUserId: string,
  ) {
    const quiz = await this.getQuizWithQuestions(quizId);
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status !== LabQuizStatus.ENDED) {
      throw new BadRequestException('Short answers can be graded after the quiz ends');
    }

    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId, quizId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const questionById = new Map(
      (quiz.questions ?? []).map((question) => [question.id, question]),
    );
    const answersByQuestionId = new Map(
      (attempt.answers ?? []).map((answer) => [answer.questionId, answer]),
    );

    for (const grade of dto.grades ?? []) {
      const question = questionById.get(grade.questionId);
      if (!question) throw new BadRequestException('Invalid question');
      if (question.questionType !== LabQuizQuestionType.SHORT_ANSWER) {
        throw new BadRequestException('Only short-answer questions need manual marks');
      }
      if (grade.score > Number(question.marks ?? 0)) {
        throw new BadRequestException('Score cannot exceed question marks');
      }

      const existing = answersByQuestionId.get(grade.questionId) ?? {
        questionId: grade.questionId,
      };
      answersByQuestionId.set(grade.questionId, {
        ...existing,
        questionId: grade.questionId,
        score: grade.score,
        evaluated: true,
        teacherNote: grade.teacherNote?.trim() || null,
        evaluatedAt: new Date().toISOString(),
        evaluatedById: teacherUserId,
      });
    }

    attempt.answers = Array.from(answersByQuestionId.values());
    const evaluated = this.calculateAttemptEvaluation(
      attempt,
      quiz.questions ?? [],
      teacherUserId,
    );
    return this.sanitizeAttempt(await this.attemptRepo.save(evaluated), true);
  }

  async getProctoringEvents(quizId: string, teacherUserId: string) {
    const quiz = await this.quizRepo.findOneBy({ id: quizId });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.proctoringEnabled === false) return [];

    return this.proctoringEventRepo.find({
      where: { quizId },
      relations: ['student'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async reportProctoringEvent(
    quizId: string,
    studentUserId: string,
    dto: ReportLabQuizProctoringEventDto,
  ) {
    const quiz = await this.quizRepo.findOne({
      where: { id: quizId },
      relations: ['course', 'course.teachers'],
    });
    if (!quiz) throw new NotFoundException('Lab quiz not found');
    const { student } = await this.ensureStudentCanAccessQuiz(quiz, studentUserId);
    await this.syncExpiredQuizzes([quiz]);

    if (quiz.proctoringEnabled === false) {
      return { ignored: true };
    }
    const now = new Date();
    if (
      quiz.status !== LabQuizStatus.RUNNING ||
      !quiz.startTime ||
      !quiz.endTime ||
      now < quiz.startTime ||
      now > quiz.endTime
    ) {
      throw new ForbiddenException('Lab quiz is not currently running');
    }

    const duplicateSince = new Date(Date.now() - 8000);
    const recentDuplicate = await this.proctoringEventRepo
      .createQueryBuilder('event')
      .where('event.quizId = :quizId', { quizId })
      .andWhere('event.studentId = :studentId', { studentId: student.id })
      .andWhere('event.eventType = :eventType', { eventType: dto.eventType })
      .andWhere('event.createdAt >= :duplicateSince', { duplicateSince })
      .orderBy('event.createdAt', 'DESC')
      .getOne();

    if (recentDuplicate) return recentDuplicate;

    const savedEvent = await this.proctoringEventRepo.save(
      this.proctoringEventRepo.create({
        quizId,
        studentId: student.id,
        eventType: dto.eventType,
        questionId: dto.questionId ?? null,
        message: dto.message?.trim() || null,
        metadata: {
          quizTitle: quiz.title,
        },
      }),
    );

    return savedEvent;
  }

  async getRunningForUser(userId: string, role: UserRole) {
    if (role === UserRole.STUDENT) {
      const student = await this.studentRepo.findOne({ where: { userId } });
      if (!student) throw new NotFoundException('Student not found');
      const enrollments = await this.enrollmentRepo.find({
        where: { studentId: student.id, isActive: true },
      });
      const courseIds = enrollments.map((enrollment) => enrollment.courseId);
      if (!courseIds.length) return [];
      const quizzes = await this.quizRepo.find({
        where: { courseId: In(courseIds), status: LabQuizStatus.RUNNING },
        order: { startTime: 'DESC' },
      });
      await this.syncExpiredQuizzes(quizzes);
      const visible: LabQuiz[] = [];
      for (const quiz of quizzes) {
        if (quiz.status !== LabQuizStatus.RUNNING) continue;
        try {
          await this.ensureStudentCanAccessQuiz(quiz, userId);
          const attempt = await this.attemptRepo.findOne({
            where: { quizId: quiz.id, studentId: student.id },
          });
          if (attempt?.submittedAt) {
            continue;
          }
          visible.push(quiz);
        } catch {
          continue;
        }
      }
      return visible;
    }

    if (role === UserRole.TEACHER) {
      const teacher = await this.teacherRepo.findOne({ where: { userId } });
      if (!teacher) throw new NotFoundException('Teacher not found');
      const courses = await this.courseRepo.find({
        relations: ['teachers'],
      });
      const courseIds = courses
        .filter((course) =>
          (course.teachers ?? []).some((item) => item.id === teacher.id),
        )
        .map((course) => course.id);
      if (!courseIds.length) return [];

      const quizzes = await this.quizRepo.find({
        where: { courseId: In(courseIds), status: LabQuizStatus.RUNNING },
        order: { startTime: 'DESC' },
      });
      await this.syncExpiredQuizzes(quizzes);
      return quizzes.filter((quiz) => quiz.status === LabQuizStatus.RUNNING);
    }

    return [];
  }

  async getReportPdf(quizId: string, teacherUserId: string) {
    const quiz = await this.getQuizWithQuestions(quizId);
    await this.getTeacherCourseAccess(quiz.courseId, teacherUserId);
    if (quiz.status !== LabQuizStatus.ENDED) {
      throw new BadRequestException('Report is available after the quiz ends');
    }

    const attempts = await this.attemptRepo.find({
      where: { quizId },
      relations: ['student'],
    });
    const hasPendingManualEvaluation = attempts.some(
      (attempt) => attempt.submittedAt && !attempt.evaluationComplete,
    );
    if (hasPendingManualEvaluation) {
      throw new BadRequestException('Grade all submitted short answers first');
    }

    const attemptByStudentId = new Map(
      attempts.map((attempt) => [attempt.studentId, attempt]),
    );
    const eligibleRows = await this.getEligibleStudentRows(quiz);
    const totalMarks = quiz.totalMarks ?? this.getQuestionMarksTotal(quiz.questions ?? []);
    const pdf = await this.reportPdf.generate({
      courseCode: quiz.course?.courseCode ?? 'Course',
      courseTitle: quiz.course?.title ?? '',
      quizTitle: quiz.title,
      sectionName: normalizeSectionName(quiz.sectionName),
      totalMarks,
      generatedAt: new Date().toLocaleString(),
      rows: eligibleRows.map((row) => {
        const attempt = attemptByStudentId.get(row.student.id);
        return {
          studentId: row.student.studentId,
          name: row.student.fullName ?? row.student.studentId,
          sectionName: row.sectionName,
          submittedAt: attempt?.submittedAt
            ? new Date(attempt.submittedAt).toLocaleString()
            : 'Not submitted',
          mcqScore: Number(attempt?.mcqScore ?? 0),
          shortScore: Number(attempt?.shortScore ?? 0),
          totalScore: Number(attempt?.totalScore ?? 0),
        };
      }),
    });

    return {
      pdf,
      fileName: `${quiz.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_results.pdf`,
    };
  }
}

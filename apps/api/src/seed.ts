/**
 * LabAssist Seed Script
 * Creates the initial OFFICE account.
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node -r tsconfig-paths/register src/seed.ts
 *
 * Env vars read from .env
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './modules/users/entities/user.entity';
import { Student } from './modules/users/entities/student.entity';
import { Teacher } from './modules/users/entities/teacher.entity';
import { TempJudge } from './modules/users/entities/temp-judge.entity';
import { TempParticipant } from './modules/users/entities/temp-participant.entity';
import { Semester } from './modules/courses/entities/semester.entity';
import { Course } from './modules/courses/entities/course.entity';
import { Enrollment } from './modules/courses/entities/enrollment.entity';
import { LabSchedule } from './modules/courses/entities/lab-schedule.entity';
import { LectureSheet } from './modules/courses/entities/lecture-sheet.entity';
import { Assignment } from './modules/assignments/entities/assignment.entity';
import { AssignmentLink } from './modules/assignments/entities/assignment-link.entity';
import { AssignmentSubmission } from './modules/assignments/entities/assignment-submission.entity';
import { LabTest } from './modules/lab-tests/entities/lab-test.entity';
import { LabTestProblem } from './modules/lab-tests/entities/lab-test-problem.entity';
import { LabSubmission } from './modules/lab-tests/entities/lab-submission.entity';
import { Contest } from './modules/contests/entities/contest.entity';
import { Problem } from './modules/contests/entities/problem.entity';
import { ContestProblem } from './modules/contests/entities/contest-problem.entity';
import { ContestSubmission } from './modules/contests/entities/contest-submission.entity';
import { ContestAnnouncement } from './modules/contests/entities/contest-announcement.entity';
import { ContestClarification } from './modules/contests/entities/contest-clarification.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { UserRole } from './common/enums/role.enum';

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'labassist_user',
    password: process.env.DB_PASSWORD ?? 'labassist_pass',
    database: process.env.DB_DATABASE ?? 'labassist',
    synchronize: true,
    entities: [
      User, Student, Teacher, TempJudge, TempParticipant,
      Semester, Course, Enrollment, LabSchedule, LectureSheet,
      Assignment, AssignmentLink, AssignmentSubmission,
      LabTest, LabTestProblem, LabSubmission,
      Contest, Problem, ContestProblem, ContestSubmission,
      ContestAnnouncement, ContestClarification,
      Notification,
    ],
  });

  await ds.initialize();
  console.log('✅ Database connected');

  const userRepo = ds.getRepository(User);

  const existing = await userRepo.findOneBy({ username: 'office' });
  if (existing) {
    console.log('ℹ️  Office account already exists — skipping.');
    await ds.destroy();
    return;
  }

  const PLAIN_PASSWORD = process.env.OFFICE_SEED_PASSWORD ?? 'LabAssist@2024!';
  const hashed = await bcrypt.hash(PLAIN_PASSWORD, 12);

  const office = userRepo.create({
    username: 'office',
    password: hashed,
    role: UserRole.OFFICE,
    isFirstLogin: false,
    isActive: true,
    expiresAt: null,
    passwordChangeSuggested: true,
  });

  await userRepo.save(office);

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  LabAssist — Office Account Created Successfully');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Username : office`);
  console.log(`  Password : ${PLAIN_PASSWORD}`);
  console.log('');
  console.log('  ⚠️  Store these credentials safely.');
  console.log('  You can override the default password by setting');
  console.log('  OFFICE_SEED_PASSWORD in apps/api/.env before running.');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  await ds.destroy();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

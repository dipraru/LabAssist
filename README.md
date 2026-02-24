# LabAssist — CSE Department Lab Management System

> **AI Agent Handoff Document**
> This README is the single source of truth for the entire LabAssist project — architecture, decisions, every entity, every API route, every frontend page, every quirk, and every bug fix applied. A new AI agent should be able to fully understand, continue, and extend the project from this document alone.

---

## Table of Contents

1. [Project Overview & Goals](#1-project-overview--goals)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Environment Configuration](#4-environment-configuration)
5. [Running the Application](#5-running-the-application)
6. [User Roles](#6-user-roles)
7. [Backend — Deep Dive](#7-backend--deep-dive)
   - 7.1 [Bootstrap (`main.ts`)](#71-bootstrap-maints)
   - 7.2 [App Module](#72-app-module)
   - 7.3 [Common Enums](#73-common-enums)
   - 7.4 [All 23 Entities](#74-all-23-entities)
   - 7.5 [Module-by-Module API Reference](#75-module-by-module-api-reference)
8. [Frontend — Deep Dive](#8-frontend--deep-dive)
   - 8.1 [Infrastructure Files](#81-infrastructure-files)
   - 8.2 [Global State (Zustand)](#82-global-state-zustand)
   - 8.3 [Components](#83-components)
   - 8.4 [Routing (App.tsx)](#84-routing-apptsx)
   - 8.5 [All 27 Pages](#85-all-27-pages)
9. [Seed Script](#9-seed-script)
10. [Critical Bug Fixes Applied](#10-critical-bug-fixes-applied)
11. [Known Route Mismatch — Frontend vs Backend](#11-known-route-mismatch--frontend-vs-backend)
12. [MVP Constraints & Future Work](#12-mvp-constraints--future-work)
13. [Database Notes](#13-database-notes)
14. [Security Notes](#14-security-notes)

---

## 1. Project Overview & Goals

**LabAssist** is a full-stack web application for a university Computer Science & Engineering (CSE) department to manage:

- **Lab Tests**: In-lab coding assessments with problems, student submissions (code or file), manual verdicts by teachers, and countdown timers
- **Assignments**: Course assignments with file uploads, deadlines, late-submission flags, and teacher grading
- **Contests**: ICPC-style and score-based programming contests with a full judge workflow — problem bank, standings (with freeze support), announcements, clarifications, and bulk participant creation
- **Courses**: Semester-based courses with teacher assignments, student enrollments, lab schedules, and lecture sheets
- **User Management**: Office creates teachers and students (bulk), creates temporary judges and participants, generates credential PDFs

### Core Design Decisions (from user requirements)

| Decision | Rationale |
|----------|-----------|
| **No code execution in MVP** | Code editor is display + submit only. `submissionStatus` and `manualVerdict` fields exist so a real judge (DOMJudge, etc.) can be wired in later via webhook endpoints that already exist. |
| **5 roles** | `office`, `teacher`, `student`, `temp_judge`, `temp_participant` — all lowercase string values in the enum |
| **NestJS + TypeORM + PostgreSQL** | Typed, modular, enterprise-grade backend |
| **React + Vite + TailwindCSS v4** | Fast modern frontend with SPA routing |
| **JWT (7 days)** | Stateless auth, no refresh token complexity in MVP |
| **bcryptjs rounds=12** | Secure password hashing on the User entity itself via lifecycle hooks |
| **PDFKit for credential sheets** | Cut-sheet PDFs for office to print and distribute login credentials |
| **Socket.io for realtime** | Contest announcements and notifications pushed to clients without polling |
| **Nodemailer (Gmail SMTP)** | Email only for assignment and lecture sheet notifications |
| **npm workspaces monorepo** | Single repo, shared `node_modules` at root |

---

## 2. Technology Stack

### Backend (`apps/api/`)
| Package | Version / Notes |
|---------|----------------|
| Node.js | v25.2.1 |
| npm | v11.6.4 |
| NestJS | v10 |
| NestJS CLI | v4.23.3 |
| TypeORM | PostgreSQL driver |
| `@nestjs/jwt` + `passport-jwt` | JWT auth |
| `bcryptjs` | Password hashing (rounds = 12) |
| `@nestjs/websockets` + `socket.io` | WebSocket gateway |
| `nodemailer` | Gmail SMTP email |
| `pdfkit` | PDF generation — **must use CommonJS require**, NOT ES import |
| `multer` | File uploads (memory storage) |
| `@nestjs/config` | `.env` loading |
| `class-validator` + `class-transformer` | DTO validation |

### Frontend (`apps/web/`)
| Package | Notes |
|---------|-------|
| React + Vite | SPA |
| TailwindCSS v4 | `@tailwindcss/vite` plugin; `@import "tailwindcss"` in CSS (NOT `@tailwind base/components/utilities`) |
| Zustand + `zustand/middleware/persist` | Auth store persisted to localStorage |
| `@tanstack/react-query` | Server state, API calls |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Form validation |
| `ace-builds` + `react-ace` | Code editor (display/submit only — no execution) |
| `lucide-react` | Icons |
| `react-hot-toast` | Toast notifications |
| `socket.io-client` | WebSocket to `/notifications` namespace |
| `axios` | HTTP client with JWT interceptor |

---

## 3. Monorepo Structure

```
/home/dipra/SystemProject/                  ← project root
├── package.json                            ← npm workspaces: ["apps/*"]
├── README.md                               ← this file
├── apps/
│   ├── api/                                ← NestJS backend
│   │   ├── .env                            ← environment variables
│   │   ├── package.json                    ← scripts: start:dev, build, seed
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts                     ← bootstrap
│   │       ├── app.module.ts               ← root module, TypeORM, all imports
│   │       ├── seed.ts                     ← standalone seed script (office account)
│   │       ├── common/
│   │       │   └── enums/
│   │       │       ├── role.enum.ts        ← UserRole enum
│   │       │       └── index.ts            ← all other enums
│   │       └── modules/
│   │           ├── storage/                ← StorageModule (@Global)
│   │           ├── users/                  ← UsersModule (profile management)
│   │           ├── auth/                   ← AuthModule (JWT, guards, decorators)
│   │           ├── office/                 ← OfficeModule (user creation, PDFs)
│   │           ├── notifications/          ← NotificationsModule (@Global, WebSocket)
│   │           ├── courses/                ← CoursesModule
│   │           ├── assignments/            ← AssignmentsModule
│   │           ├── lab-tests/              ← LabTestsModule
│   │           └── contests/               ← ContestsModule
│   └── web/                                ← React frontend
│       ├── vite.config.ts
│       ├── index.html
│       ├── package.json
│       └── src/
│           ├── App.tsx                     ← all routes defined here
│           ├── main.tsx                    ← ReactDOM root, QueryClient, Toaster
│           ├── index.css                   ← @import "tailwindcss"
│           ├── lib/
│           │   ├── api.ts                  ← axios instance + JWT interceptor
│           │   └── socket.ts               ← socket.io-client helper
│           ├── store/
│           │   └── auth.store.ts           ← Zustand auth store
│           ├── components/
│           │   ├── ProtectedRoute.tsx
│           │   ├── AppShell.tsx
│           │   └── AnnouncementModal.tsx
│           └── pages/
│               ├── LoginPage.tsx
│               ├── office/                 ← 6 pages
│               ├── teacher/                ← 5 pages
│               ├── student/                ← 5 pages
│               ├── judge/                  ← 5 pages
│               └── participant/            ← 5 pages
```

---

## 4. Environment Configuration

**File**: `apps/api/.env`

```env
NODE_ENV=development
PORT=3000
APP_NAME=LabAssist

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=labassist_user
DB_PASSWORD=labassist_pass
DB_DATABASE=labassist

JWT_SECRET=labassist_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

UPLOAD_DEST=./uploads
MAX_ASSIGNMENT_FILE_SIZE=10485760
MAX_SUBMISSION_FILE_SIZE=262144

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_gmail@gmail.com
MAIL_PASS=your_gmail_app_password
MAIL_FROM=LabAssist <your_gmail@gmail.com>

FRONTEND_URL=http://localhost:5173
```

**Notes:**
- `UPLOAD_DEST=./uploads` → files stored at `apps/api/uploads/`; served statically at `/uploads/*`
- `MAX_ASSIGNMENT_FILE_SIZE=10485760` → 10 MB
- `MAX_SUBMISSION_FILE_SIZE=262144` → 256 KB
- TypeORM `synchronize: true` when `NODE_ENV !== 'production'` → auto-migrates schema on start
- TypeORM `logging: true` when `NODE_ENV === 'development'`

---

## 5. Running the Application

### Prerequisites

```bash
# PostgreSQL must be running
psql -U postgres -c "CREATE USER labassist_user WITH PASSWORD 'labassist_pass';"
psql -U postgres -c "CREATE DATABASE labassist OWNER labassist_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE labassist TO labassist_user;"

# Install all dependencies from monorepo root
cd /home/dipra/SystemProject
npm install
```

### Start Backend

```bash
cd /home/dipra/SystemProject/apps/api
npm run start:dev
# → Listens on http://localhost:3000/api
# → Static files served at http://localhost:3000/uploads/
```

### Seed Office Account (already executed — skip if DB already has data)

```bash
cd /home/dipra/SystemProject/apps/api
npm run seed
# Creates office account: username=office, password=LabAssist@2024!
# (reads OFFICE_SEED_PASSWORD env var, defaults to LabAssist@2024!)
```

**Seeded credentials:**
- Username: `office`
- Password: `LabAssist@2024!`

### Start Frontend

```bash
cd /home/dipra/SystemProject/apps/web
npm run dev
# → Vite dev server at http://localhost:5173
```

### Login

1. Open `http://localhost:5173/login`
2. Enter `office` / `LabAssist@2024!`
3. You are redirected to `/office` dashboard

---

## 6. User Roles

```typescript
// apps/api/src/common/enums/role.enum.ts
export enum UserRole {
  OFFICE           = 'office',            // ← ALL VALUES ARE LOWERCASE strings
  TEACHER          = 'teacher',
  STUDENT          = 'student',
  TEMP_JUDGE       = 'temp_judge',
  TEMP_PARTICIPANT = 'temp_participant',
}
```

> ⚠️ **Critical**: The enum values are lowercase strings (e.g., `'office'`), not uppercase (`'OFFICE'`). The JWT payload `role` field stores these lowercase values. All `@Roles()` checks use `UserRole.OFFICE` etc. which resolve to these lowercase strings.

### Role Capabilities Summary

| Role | Can Do |
|------|--------|
| `office` | Create/manage teachers, students (bulk), semesters, courses, enrollments, temp judges; generate credential PDFs; view all data |
| `teacher` | Manage courses (their own), create/manage assignments, lab tests, lecture sheets; grade submissions |
| `student` | View courses, submit assignments (file upload), participate in lab tests (ACE editor or file), view grades |
| `temp_judge` | Create problem bank, create/manage contests, grade contest submissions, post announcements, answer clarifications, bulk-create participants |
| `temp_participant` | Participate in a specific contest: submit code, view standings, ask clarifications |

### Account Lifecycle

- **Office creates teachers**: username auto-generated, password auto-generated, PDF cut-sheet printed
- **Office creates students (bulk)**: `startId` → `endId` (max 200 at once), IDs are 7-digit zero-padded
- **Office creates temp judges**: ID format `TJ-YYYY-NNN`, has `accessFrom`/`accessUntil` dates
- **Temp judge creates participants**: ID format `TP-NNN`, bulk (`count` param), PDF cut-sheet
- **`isFirstLogin` flag**: Students must complete profile on first login (gated by `StudentProfile` page). Office/teacher/judge may also have `isFirstLogin=true` initially (password change suggestion).
- **`isActive` flag**: Office can toggle any user active/inactive via `PATCH /api/office/users/:userId/toggle-active`
- **`expiresAt`**: TempJudge and TempParticipant have expiry dates — Office can extend TempJudge via `PATCH /api/office/judges/:id/extend`

---

## 7. Backend — Deep Dive

### 7.1 Bootstrap (`main.ts`)

```typescript
// apps/api/src/main.ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);

app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // strip unknown properties
  forbidNonWhitelisted: true,
  transform: true,           // auto-transform types (string → number etc.)
}));

app.setGlobalPrefix('api');

// Serve uploaded files statically
app.useStaticAssets(path.join(__dirname, '..', 'uploads'), {
  prefix: '/uploads',
});

await app.listen(process.env.PORT || 3000);
```

### 7.2 App Module

**File**: `apps/api/src/app.module.ts`

**TypeORM config:**
```typescript
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.get('DB_HOST'),
    port: +config.get<number>('DB_PORT'),
    username: config.get('DB_USERNAME'),
    password: config.get('DB_PASSWORD'),
    database: config.get('DB_DATABASE'),
    entities: [/* all 23 entities */],
    synchronize: config.get('NODE_ENV') !== 'production',
    logging: config.get('NODE_ENV') === 'development',
  }),
})
```

**All 9 modules imported:**
1. `StorageModule`
2. `UsersModule`
3. `AuthModule`
4. `OfficeModule`
5. `CoursesModule`
6. `AssignmentsModule`
7. `LabTestsModule`
8. `ContestsModule`
9. `NotificationsModule`

**All 23 entities registered in TypeORM `entities` array:**
`User, Student, Teacher, TempJudge, TempParticipant, Semester, Course, Enrollment, LabSchedule, LectureSheet, Assignment, AssignmentLink, AssignmentSubmission, LabTest, LabTestProblem, LabSubmission, Contest, Problem, ContestProblem, ContestSubmission, ContestAnnouncement, ContestClarification, Notification`

### 7.3 Common Enums

**File**: `apps/api/src/common/enums/role.enum.ts`

```typescript
export enum UserRole {
  OFFICE           = 'office',
  TEACHER          = 'teacher',
  STUDENT          = 'student',
  TEMP_JUDGE       = 'temp_judge',
  TEMP_PARTICIPANT = 'temp_participant',
}
```

**File**: `apps/api/src/common/enums/index.ts`

```typescript
export enum SubmissionStatus {
  PENDING              = 'pending',
  JUDGING              = 'judging',
  ACCEPTED             = 'accepted',
  WRONG_ANSWER         = 'wrong_answer',
  TIME_LIMIT_EXCEEDED  = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  RUNTIME_ERROR        = 'runtime_error',
  COMPILATION_ERROR    = 'compilation_error',
  PRESENTATION_ERROR   = 'presentation_error',
  SKIPPED              = 'skipped',
  MANUAL_REVIEW        = 'manual_review',
}

export enum ManualVerdict {
  ACCEPTED             = 'accepted',
  WRONG_ANSWER         = 'wrong_answer',
  TIME_LIMIT_EXCEEDED  = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  RUNTIME_ERROR        = 'runtime_error',
  COMPILATION_ERROR    = 'compilation_error',
  PARTIAL              = 'partial',
  PENDING              = 'pending',
}

export enum ProgrammingLanguage {
  C          = 'c',
  CPP        = 'cpp',
  JAVA       = 'java',
  PYTHON     = 'python',
  PYTHON3    = 'python3',
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
}

export enum ContestType {
  ICPC        = 'icpc',
  SCORE_BASED = 'score_based',
}

export enum ContestStatus {
  DRAFT     = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING   = 'running',
  FROZEN    = 'frozen',
  ENDED     = 'ended',
}

export enum LabTestType {
  VERDICT_BASED = 'verdict_based',
  NON_VERDICT   = 'non_verdict',
}

export enum AssignmentStatus {
  DRAFT     = 'draft',
  PUBLISHED = 'published',
  CLOSED    = 'closed',
}

export enum SemesterName {
  SEMESTER_1 = 'semester_1',
  SEMESTER_2 = 'semester_2',
  SEMESTER_3 = 'semester_3',
  SEMESTER_4 = 'semester_4',
  SEMESTER_5 = 'semester_5',
  SEMESTER_6 = 'semester_6',
  SEMESTER_7 = 'semester_7',
  SEMESTER_8 = 'semester_8',
}
```

> ⚠️ **`LabTestStatus`** is a **local enum** defined inside `apps/api/src/modules/lab-tests/entities/lab-test.entity.ts`. It is **NOT** exported from `common/enums/index.ts`. Any file that needs it must import it as:
> ```typescript
> import { LabTestStatus } from '../entities/lab-test.entity';
> // or from modules/lab-tests/entities/lab-test.entity if cross-module
> ```

### 7.4 All 23 Entities

All entity files are in `apps/api/src/modules/{module}/entities/`.

> ⚠️ **Global TypeORM fix applied**: Every `@Column({ nullable: true })` that had no explicit `type` was changed to `@Column({ type: 'varchar', nullable: true })` via global `sed`. This was done because TypeORM throws `"Data type Object not supported"` for `nullable: true` columns without an explicit type on some PostgreSQL driver versions.

---

#### `User` — `users/entities/user.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | `@PrimaryGeneratedColumn('uuid')` |
| `username` | varchar (unique) | Login identifier |
| `password` | varchar | `select: false` — excluded from default SELECTs; hashed via `@BeforeInsert`/`@BeforeUpdate` hooks using bcryptjs rounds=12 |
| `role` | `UserRole` enum | `'office'\|'teacher'\|'student'\|'temp_judge'\|'temp_participant'` |
| `isFirstLogin` | boolean | Default `true`; set to `false` after profile completion or `POST /api/auth/first-login-done` |
| `isActive` | boolean | Default `true`; toggle via office |
| `expiresAt` | `timestamptz` (nullable) | Used for temp accounts |
| `passwordChangeSuggested` | boolean | Informational flag |

**Methods on entity:**
- `validatePassword(plain: string): Promise<boolean>` — bcrypt compare

---

#### `Student` — `users/entities/student.entity.ts`

One-to-one with `User`. Profile fields filled by student on first login.

| Column | Type | Notes |
|--------|------|-------|
| `studentId` | varchar | 7-digit zero-padded (e.g., `0000001`) |
| `batchYear` | varchar | e.g., `'2022'` |
| `deptCode` | varchar | e.g., `'CSE'` |
| `rollNumber` | varchar | |
| `fullName` | varchar (nullable) | |
| `phone` | varchar (nullable) | |
| `email` | varchar (nullable) | |
| `dateOfBirth` | date (nullable) | |
| `fathersName` | varchar (nullable) | ⚠️ NOT `fatherName` |
| `mothersName` | varchar (nullable) | |
| `presentAddress` | varchar (nullable) | ⚠️ NOT `address` |
| `permanentAddress` | varchar (nullable) | |
| `profilePhoto` | varchar (nullable) | Path to uploaded file |
| `profileCompleted` | boolean | Default `false`; set to `true` when profile PATCH is called |

---

#### `Teacher` — `users/entities/teacher.entity.ts`

One-to-one with `User`.

| Column | Type | Notes |
|--------|------|-------|
| `teacherId` | varchar | Auto-generated |
| `fullName` | varchar | |
| `designation` | `TeacherDesignation` enum | Professor, Associate Professor, etc. |
| `email` | varchar | |
| `phone` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `profilePhoto` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |

---

#### `TempJudge` — `users/entities/temp-judge.entity.ts`

One-to-one with `User`.

| Column | Type | Notes |
|--------|------|-------|
| `judgeId` | varchar | Auto-generated format: `TJ-YYYY-NNN` |
| `accessFrom` | timestamptz | Start of access window |
| `accessUntil` | timestamptz | End of access window; extendable |
| `notes` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `createdByOfficeId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |

---

#### `TempParticipant` — `users/entities/temp-participant.entity.ts`

One-to-one with `User`.

| Column | Type | Notes |
|--------|------|-------|
| `participantId` | varchar | Auto-generated format: `TP-NNN` |
| `fullName` | varchar | |
| `contestId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `accessFrom` | timestamptz | |
| `accessUntil` | timestamptz | |
| `createdByJudgeId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `userId` | varchar | FK to User |

---

#### `Semester` — `courses/entities/semester.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `name` | `SemesterName` enum | `'semester_1'` through `'semester_8'` |
| `batchYear` | varchar | e.g., `'2022'` |
| `startDate` | date | |
| `endDate` | date | |
| `isCurrent` | boolean | Office sets one semester as current |

---

#### `Course` — `courses/entities/course.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `courseCode` | varchar | e.g., `'CSE301'` |
| `title` | varchar | |
| `type` | `CourseType` enum | (theory/lab) |
| `creditHours` | number | |
| `semesterId` | varchar | FK to Semester |
| (relation) | `ManyToMany` teachers | Teacher[] |

---

#### `Enrollment` — `courses/entities/enrollment.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `courseId` | varchar | Composite unique with `studentId` |
| `studentId` | varchar | Composite unique with `courseId` |
| `isActive` | boolean | Default `true` |

---

#### `LabSchedule` — `courses/entities/lab-schedule.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `dayOfWeek` | `DayOfWeek` enum | Monday–Sunday |
| `startTime` | varchar | e.g., `'09:00'` |
| `endTime` | varchar | |
| `roomNumber` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `batchYear` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |

---

#### `LectureSheet` — `courses/entities/lecture-sheet.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `description` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `links` | jsonb | Array of `{url, label}` objects |
| `courseId` | varchar | FK |
| `postedById` | varchar | FK to User |

---

#### `Assignment` — `assignments/entities/assignment.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `caption` | varchar | |
| `status` | `AssignmentStatus` | `draft\|published\|closed` |
| `deadline` | timestamptz | |
| `allowLateSubmission` | boolean | |
| `totalMarks` | number | |
| (relation) | `OneToMany` AssignmentLink | |

---

#### `AssignmentLink` — `assignments/entities/assignment-link.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `url` | varchar | |
| `label` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `assignmentId` | varchar | FK |

---

#### `AssignmentSubmission` — `assignments/entities/assignment-submission.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `assignmentId` | varchar | FK |
| `studentId` | varchar | FK |
| `fileUrl` | varchar | Path to uploaded file |
| `fileName` | varchar | Original filename |
| `notes` | varchar | Student's notes |
| `status` | `AssignmentStatus` | Reused for submission state |
| `score` | number (nullable) | Set by teacher grading |
| `feedback` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `gradedById` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |

---

#### `LabTest` — `lab-tests/entities/lab-test.entity.ts`

> ⚠️ `LabTestStatus` is a **local enum** in this file — import from here, not from `common/enums`

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `type` | `LabTestType` | `verdict_based\|non_verdict` |
| `status` | `LabTestStatus` (LOCAL) | `draft\|running\|ended` |
| `startTime` | timestamptz | |
| `endTime` | timestamptz | |
| `totalMarks` | number | |
| `courseId` | varchar | FK |

> ⚠️ `LabTest` has **NO** `createdById` field.

---

#### `LabTestProblem` — `lab-tests/entities/lab-test-problem.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `statement` | text | Full problem statement |
| `orderIndex` | number | Display order |
| `marks` | number | |
| `timeLimitMs` | number | |
| `memoryLimitKb` | number | |
| `inputFile` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `outputFile` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `sampleTestCases` | jsonb | `[{input, output, explanation?}]` |

---

#### `LabSubmission` — `lab-tests/entities/lab-submission.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `problemId` | varchar | FK to LabTestProblem |
| `studentId` | varchar | FK to User |
| `code` | text (nullable) | Submitted code |
| `fileUrl` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `language` | `ProgrammingLanguage` | |
| `submissionStatus` | `SubmissionStatus` | Default: `MANUAL_REVIEW` |
| `manualVerdict` | `ManualVerdict` (nullable) | Teacher sets this |
| `score` | number (nullable) | |
| `instructorNote` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `gradedById` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `judgeToken` | varchar (nullable) | `{ type: 'varchar', nullable: true }` (future judge webhook) |
| `submittedAt` | timestamptz | ⚠️ NOT `createdAt` — order by this field |

---

#### `Contest` — `contests/entities/contest.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `type` | `ContestType` | `icpc\|score_based` |
| `status` | `ContestStatus` | `draft\|scheduled\|running\|frozen\|ended` |
| `startTime` | timestamptz | |
| `endTime` | timestamptz | |
| `freezeTime` | timestamptz (nullable) | When standings freeze |
| `isStandingFrozen` | boolean | Default `false` |
| `createdById` | varchar (nullable) | `{ type: 'varchar', nullable: true }` — FK to User (judge) |

> ⚠️ `ContestStatus.UPCOMING` does **NOT** exist. Use `ContestStatus.SCHEDULED`.

---

#### `Problem` — `contests/entities/problem.entity.ts`

Problem bank for contests. A problem can belong to multiple contests via `ContestProblem`.

| Column | Type | Notes |
|--------|------|-------|
| `title` | varchar | |
| `statement` | text | |
| `timeLimitMs` | number | |
| `memoryLimitKb` | number | |
| `inputFile` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `outputFile` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `sampleTestCases` | jsonb | `[{input, output}]` |
| `authorId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` ⚠️ NOT `createdById` |
| `isPublic` | boolean | |
| `isFrozen` | boolean | |
| (relation) | `@OneToMany(() => ContestProblem, ...)` | Explicit import required |

---

#### `ContestProblem` — `contests/entities/contest-problem.entity.ts`

Join table between Contest and Problem with extra fields.

| Column | Type | Notes |
|--------|------|-------|
| `contestId` | varchar | FK |
| `problemId` | varchar | FK |
| `label` | varchar | `A`, `B`, `C`, ... |
| `orderIndex` | number | |
| `score` | number (nullable) | Used for score_based contests |

---

#### `ContestSubmission` — `contests/entities/contest-submission.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `contestId` | varchar | FK |
| `contestProblemId` | varchar | FK to ContestProblem |
| `participantId` | varchar | FK to User |
| `participantName` | varchar | Denormalized for display |
| `code` | text (nullable) | |
| `fileUrl` | varchar (nullable) | |
| `language` | `ProgrammingLanguage` | |
| `submissionStatus` | `SubmissionStatus` | Default: `PENDING` |
| `manualVerdict` | `ManualVerdict` (nullable) | Judge sets this |
| `score` | number (nullable) | score_based contests |
| `penaltyMinutes` | number (nullable) | ICPC: 20 per WA |
| `judgeToken` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `submittedAt` | timestamptz | ⚠️ NOT `createdAt` |

---

#### `ContestAnnouncement` — `contests/entities/contest-announcement.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `contestId` | varchar | FK |
| `authorId` | varchar | FK to User (judge) |
| `title` | varchar | |
| `body` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `isPinned` | boolean | Default `false` |

---

#### `ContestClarification` — `contests/entities/contest-clarification.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `contestId` | varchar | FK |
| `participantId` | varchar | ⚠️ NOT `askedById` |
| `participantName` | varchar | Denormalized |
| `question` | text | |
| `answer` | text (nullable) | Set by judge |
| `answeredById` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `status` | `ClarificationStatus` (LOCAL enum) | `pending\|answered\|broadcast` |
| `contestProblemId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` |
| `isBroadcast` | boolean | Broadcast to all participants |

---

#### `Notification` — `notifications/entities/notification.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| `recipientUserId` | varchar | FK to User |
| `type` | `NotificationType` enum | Various notification types |
| `title` | varchar | |
| `body` | text | |
| `referenceId` | varchar (nullable) | `{ type: 'varchar', nullable: true }` — ID of related resource |
| `isRead` | boolean | Default `false` |
| `emailSent` | boolean | Default `false`; tracks whether email was dispatched |

---

### 7.5 Module-by-Module API Reference

All routes are under global prefix `/api`. Auth uses `Bearer <token>` header.

---

#### StorageModule (`@Global()`)

Not a REST module — a shared service injected globally.

**`StorageService` methods:**
- `saveBuffer(buffer: Buffer, filename: string, folder: string, maxBytes: number): Promise<string>` — Saves file to `uploads/{folder}/`, returns relative path
- `deleteFile(relativePath: string): Promise<void>` — Deletes uploaded file

**Upload folders used:**
- `profiles` — student/teacher profile photos
- `submissions` — code file submissions
- `assignments` — assignment submission files
- `problems` — problem input/output files

---

#### AuthModule

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|--------------|----------|
| POST | `/api/auth/login` | None | `{username, password}` | `{user: {id, username, role, isFirstLogin}, token: string}` |
| GET | `/api/auth/me` | JWT | — | current user object |
| PATCH | `/api/auth/change-password` | JWT | `{currentPassword, newPassword}` | success |
| POST | `/api/auth/first-login-done` | JWT | — | marks `isFirstLogin=false` |

**JWT Payload:**
```json
{ "sub": "userId", "username": "username", "role": "office" }
```

**Guards and Decorators (in `modules/auth/`):**
- `JwtAuthGuard` — validates Bearer token; adds `req.user` as `{userId: sub, username, role}`
- `RolesGuard` — reads `@Roles()` metadata, checks `req.user.role`
- `@CurrentUser()` — parameter decorator extracting `req.user`
- `@Roles(...roles: UserRole[])` — metadata decorator for `RolesGuard`
- JWT Strategy: `secretOrKey: config.get<string>('JWT_SECRET') ?? ''` (the `?? ''` is required to prevent TS error)
- `expiresIn` cast as `any` in `JwtModule.registerAsync` to avoid TypeScript strict typing issue

---

#### UsersModule

| Method | Path | Auth | Body / Notes | Response |
|--------|------|------|-------------|----------|
| GET | `/api/users/profile` | JWT | — | Profile data based on role |
| PATCH | `/api/users/profile` | JWT | Student fields OR Teacher fields | Sets `profileCompleted=true`, `isFirstLogin=false` |
| POST | `/api/users/profile/photo` | JWT | `multipart/form-data`, field: `photo` | Sets `profilePhoto` path; saves to `profiles/` folder |

**Student updateable fields:** `fullName`, `phone`, `email`, `dateOfBirth`, `fathersName`, `mothersName`, `presentAddress`, `permanentAddress`

**Teacher updateable fields:** `fullName`, `designation`, `email`, `phone`

---

#### OfficeModule

All routes require `OFFICE` role.

| Method | Path | Body / Params | Response |
|--------|------|--------------|----------|
| GET | `/api/office/dashboard` | — | Stats object |
| POST | `/api/office/teachers` | `CreateTeacherDto` | `{teacher, credentials: {username, password}}` |
| GET | `/api/office/teachers` | — | Teacher[] |
| PATCH | `/api/office/teachers/correct` | `CorrectTeacherDto` | Updated teacher |
| PATCH | `/api/office/users/:userId/toggle-active` | — | Updated user |
| POST | `/api/office/students/bulk` | `{startId, endId}` (max 200, skips existing) | `{created[], skipped[]}` |
| GET | `/api/office/students` | `?batch=` (optional) | Student[] |
| PATCH | `/api/office/students/correct` | `CorrectStudentDto` | Updated student |
| POST | `/api/office/credentials/pdf` | `{credentials: [{username, password, name}]}` | `{pdf: base64string}` |
| POST | `/api/office/judges` | `CreateTempJudgeDto` | `{judge, credentials: {username, password}}` |
| GET | `/api/office/judges` | — | TempJudge[] |
| PATCH | `/api/office/judges/:id/extend` | `ExtendTempJudgeDto` | Updated judge |
| POST | `/api/office/semesters` | `CreateSemesterDto` | Semester |
| GET | `/api/office/semesters` | — | Semester[] |

**ID generation:**
- Students: 7-digit zero-padded integer string (e.g., `'0000001'`)
- TempJudges: `TJ-{YEAR}-{3-digit-seq}` (e.g., `TJ-2025-001`)
- TempParticipants: `TP-{3-digit-seq}` (e.g., `TP-001`)

**PDF Generation (PDFKit):**
```typescript
// ⚠️ Must use CommonJS require, NOT ES import
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
// chunk typed as Buffer in the stream
doc.on('data', (chunk: Buffer) => chunks.push(chunk));
```
The PDF is a two-column cut-sheet: each credential card has username, password, and name.

---

#### NotificationsModule (`@Global()`)

**`NotificationsService` — key method:**
```typescript
// ⚠️ ONLY 2 arguments total
async createBulk(
  userIds: string[],
  payload: { type: NotificationType; title: string; body: string; referenceId?: string }
): Promise<void>
```
- Saves `Notification` records to DB
- Sends email only for `ASSIGNMENT_POSTED` and `LECTURE_SHEET_POSTED` types
- Emits `notification` WebSocket event to each user's room

**`NotificationsGateway`:**
- Namespace: `/notifications`
- Rooms: `user:{userId}` (individual), `contest:{contestId}` (contest-wide)
- Client events: `join-contest`, `leave-contest`
- Server emitted events: `announcement`, `notification`
- Methods: `sendToUser(userId, event, data)`, `sendToContest(contestId, event, data)`

**REST Endpoints:**

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/notifications` | JWT | Returns notifications for current user |
| POST | `/api/notifications/:id/read` | JWT | Marks notification as read |

---

#### CoursesModule

| Method | Path | Auth | Body / Params | Notes |
|--------|------|------|--------------|-------|
| POST | `/api/courses` | OFFICE | `CreateCourseDto` | Creates course |
| GET | `/api/courses` | JWT | — | All courses |
| GET | `/api/courses/my` | JWT | — | Teacher: assigned courses; Student: enrolled courses; Office: all |
| GET | `/api/courses/:id` | JWT | — | Single course |
| GET | `/api/courses/:id/enrollments` | JWT | — | Enrollments for course |
| POST | `/api/courses/enroll` | OFFICE | `EnrollStudentsDto` | Enroll by `batchYear` OR `userIds[]` |
| DELETE | `/api/courses/:courseId/students/:studentUserId` | OFFICE | — | Remove enrollment |
| POST | `/api/courses/teachers` | OFFICE | `AddTeacherToCourseDto` | Assign teacher to course |
| DELETE | `/api/courses/:courseId/teachers/:teacherId` | OFFICE | — | Remove teacher from course |
| POST | `/api/courses/schedules` | OFFICE | `CreateScheduleDto` | Create lab schedule |
| GET | `/api/courses/schedules/all` | JWT | `?courseId=&batch=` | Get schedules |
| DELETE | `/api/courses/schedules/:id` | OFFICE | — | Delete schedule |
| POST | `/api/courses/lecture-sheets` | TEACHER | `CreateLectureSheetDto` | Post lecture sheet; notifies enrolled students |
| GET | `/api/courses/:courseId/lecture-sheets` | JWT | — | Get lecture sheets for course |

---

#### AssignmentsModule

| Method | Path | Auth | Body / Notes |
|--------|------|------|-------------|
| POST | `/api/assignments` | TEACHER | `CreateAssignmentDto`; notifies enrolled students |
| GET | `/api/assignments/course/:courseId` | JWT | Assignments for course |
| GET | `/api/assignments/:id` | JWT | Single assignment |
| PATCH | `/api/assignments/:id` | TEACHER | `UpdateAssignmentDto` |
| POST | `/api/assignments/:id/submit` | STUDENT | `multipart/form-data`; field: `file` (max 10MB); optional `notes`; upsert; late detection |
| GET | `/api/assignments/:id/submissions` | TEACHER | All submissions for assignment |
| GET | `/api/assignments/:id/my-submission` | STUDENT | Student's own submission |
| PATCH | `/api/assignments/submissions/:submissionId/grade` | TEACHER | `GradeSubmissionDto {score, feedback}` |

---

#### LabTestsModule

| Method | Path | Auth | Body / Notes |
|--------|------|------|-------------|
| POST | `/api/lab-tests` | TEACHER | `CreateLabTestDto` |
| PATCH | `/api/lab-tests/:id/status` | TEACHER | `{status: LabTestStatus}` |
| GET | `/api/lab-tests/course/:courseId` | TEACHER | Lab tests for course |
| GET | `/api/lab-tests/:id/submissions` | TEACHER | All submissions for lab test |
| GET | `/api/lab-tests/problems/:problemId/submissions` | TEACHER | Submissions for a specific problem |
| PATCH | `/api/lab-tests/submissions/:id/grade` | TEACHER | `ManualGradeDto {score, manualVerdict, instructorNote}` |
| GET | `/api/lab-tests/running` | STUDENT | Currently running lab tests for student's courses |
| GET | `/api/lab-tests/:id` | STUDENT | Lab test details |
| GET | `/api/lab-tests/:id/problems` | STUDENT | Problems list (only when lab test is running) |
| POST | `/api/lab-tests/problems/:problemId/submit` | STUDENT | `multipart/form-data`; fields: `code` (text) OR `file` (max 256KB) + `language` |
| GET | `/api/lab-tests/problems/:problemId/my-submissions` | STUDENT | Student's submissions for a problem |
| PATCH | `/api/lab-tests/submissions/:id/result` | None (token-based) | Future judge webhook |

**Ordering:** Submissions are ordered by `submittedAt` (not `createdAt`).

---

#### ContestsModule

| Method | Path | Auth | Body / Notes |
|--------|------|------|-------------|
| GET | `/api/contests` | JWT | All contests |
| GET | `/api/contests/:id` | JWT | Contest with `contestProblems` relation loaded |
| GET | `/api/contests/:id/standings` | JWT | ICPC or score-based standings; respects freeze for non-judges |
| GET | `/api/contests/:id/announcements` | JWT | All announcements for contest |
| POST | `/api/contests/problems` | TEMP_JUDGE | `CreateProblemDto`; sets `authorId` from JWT |
| GET | `/api/contests/problems/mine` | TEMP_JUDGE | Judge's own problems |
| GET | `/api/contests/problems/:id` | TEMP_JUDGE | Single problem |
| PATCH | `/api/contests/problems/:id` | TEMP_JUDGE | `Partial<CreateProblemDto>` |
| POST | `/api/contests/problems/:id/files` | TEMP_JUDGE | `multipart/form-data`; fields: `inputFile`, `outputFile` |
| POST | `/api/contests` | TEMP_JUDGE | `CreateContestDto` |
| PATCH | `/api/contests/:id/status` | TEMP_JUDGE | `{status: ContestStatus}` |
| POST | `/api/contests/:id/problems` | TEMP_JUDGE | `AddContestProblemDto` |
| PATCH | `/api/contests/:id/freeze` | TEMP_JUDGE | `{frozen: boolean}` |
| GET | `/api/contests/:id/submissions/all` | TEMP_JUDGE | All submissions for contest |
| PATCH | `/api/contests/submissions/:id/grade` | TEMP_JUDGE | `GradeContestSubmissionDto {manualVerdict, score, penaltyMinutes?}` |
| POST | `/api/contests/:id/announcements` | TEMP_JUDGE | `CreateAnnouncementDto`; broadcasts via WebSocket `announcement` event |
| GET | `/api/contests/:id/clarifications/pending` | TEMP_JUDGE | Pending clarifications |
| PATCH | `/api/contests/clarifications/:id/answer` | TEMP_JUDGE | `AnswerClarificationDto {answer}` |
| POST | `/api/contests/participants/bulk` | TEMP_JUDGE | `{contestId, count}` → creates TempParticipants; returns `{participants, pdf: base64}` |
| POST | `/api/contests/:id/submit` | TEMP_PARTICIPANT or STUDENT | `multipart/form-data`; fields: `contestProblemId`, `language`, `code` OR `file` (max 256KB) |
| GET | `/api/contests/:id/my-submissions` | TEMP_PARTICIPANT or STUDENT | Own submissions |
| POST | `/api/contests/:id/clarifications` | TEMP_PARTICIPANT or STUDENT | `AskClarificationDto {question, contestProblemId?}` |
| GET | `/api/contests/:id/clarifications/mine` | TEMP_PARTICIPANT or STUDENT | Own clarifications |
| PATCH | `/api/contests/submissions/:id/result` | None (token-based) | Future judge webhook |

**Standings Format:**
```json
{
  "problems": [{"label": "A"}, {"label": "B"}],
  "rows": [
    {
      "participantId": "uuid",
      "participantName": "TP-001",
      "solved": 2,
      "totalPenalty": 40,
      "problems": [
        {"label": "A", "accepted": true, "attempts": 1, "penalty": 0},
        {"label": "B", "accepted": true, "attempts": 2, "penalty": 40}
      ]
    }
  ]
}
```

**ICPC Penalty:** `ICPC_WRONG_PENALTY = 20` minutes per wrong answer.

---

## 8. Frontend — Deep Dive

### 8.1 Infrastructure Files

#### `apps/web/vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
})
```

#### `apps/web/src/index.css`
```css
@import "tailwindcss";
```
> ⚠️ TailwindCSS v4 uses `@import "tailwindcss"`, NOT the v3 directives `@tailwind base; @tailwind components; @tailwind utilities`.

#### `apps/web/src/lib/api.ts`
- `axios` instance with `baseURL: '/api'`
- Request interceptor: reads `labassist_token` from `localStorage`, adds `Authorization: Bearer <token>` header
- Response interceptor: on 401, clears `localStorage` and redirects to `/login`

> ⚠️ The localStorage key used for the token is `labassist_token`. The Zustand store persists to `labassist-auth`. The JWT interceptor in `api.ts` reads `labassist_token` directly from localStorage (the Zustand persist store writes the token there as part of the serialized state — ensure the key matches).

#### `apps/web/src/lib/socket.ts`
```typescript
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('labassist_token');
    socket = io(window.location.origin, {
      path: '/socket.io',
      namespace: '/notifications',  // connects to /notifications namespace
      auth: { token },
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

### 8.2 Global State (Zustand)

#### `apps/web/src/store/auth.store.ts`

```typescript
interface AuthState {
  user: {
    id: string;
    username: string;
    role: string;          // lowercase: 'office'|'teacher'|'student'|'temp_judge'|'temp_participant'
    isFirstLogin: boolean;
    profile?: any;
  } | null;
  token: string | null;
}

interface AuthActions {
  setAuth: (user: AuthState['user'], token: string) => void;
  logout: () => void;
  updateProfile: (profile: any) => void;
}
```

- Persisted to localStorage key: `labassist-auth`
- `isFirstLoginRequired()`: helper that returns `true` if `role === 'student' && isFirstLogin === true`

### 8.3 Components

#### `ProtectedRoute.tsx`
```typescript
<ProtectedRoute allowedRoles={['office']}>
  <SomePage />
</ProtectedRoute>
```
- If not authenticated → redirect to `/login`
- If wrong role → redirect to `/unauthorized`

#### `AppShell.tsx`

Collapsible sidebar layout component.

- Expanded width: `w-56`; Collapsed width: `w-14`
- Toggle button in top-left
- Top-right: notification bell (shows unread count badge), user info, logout button

**Role-based sidebar navigation items:**

| Role | Nav Items |
|------|-----------|
| `office` | Dashboard (`/office`), Teachers (`/office/teachers`), Students (`/office/students`), Courses (`/office/courses`), Semesters (`/office/semesters`), Temp Judges (`/office/temp-judges`) |
| `teacher` | Dashboard (`/teacher`), Courses (`/teacher/courses`), Assignments (`/teacher/assignments`), Lab Tests (`/teacher/lab-tests`), Lecture Sheets (`/teacher/lecture-sheets`) |
| `student` | Dashboard (`/student`), Profile (`/student/profile`), Courses (`/student/courses`), Assignments (`/student/assignments`), Lab Tests (`/student/lab-tests`) |
| `temp_judge` | Dashboard (`/judge`), New Contest (`/judge/contests/create`) |
| `temp_participant` | (empty — uses in-contest navigation) |

#### `AnnouncementModal.tsx`

WebSocket-driven blocking modal for contest announcements.

- Joins `contest:{contestId}` room on mount via `getSocket().emit('join-contest', contestId)`
- Listens to `announcement` event
- Shows pinned badge if `announcement.isPinned === true`
- Has a close button to dismiss
- Props: `{ contestId: string }`

### 8.4 Routing (`App.tsx`)

```
/login                           → LoginPage (no auth)
/unauthorized                    → Unauthorized message page

/office                          → ProtectedRoute(['office'])  → OfficeDashboard
/office/teachers                 → ProtectedRoute(['office'])  → ManageTeachers
/office/students                 → ProtectedRoute(['office'])  → ManageStudents
/office/courses                  → ProtectedRoute(['office'])  → ManageCourses
/office/semesters                → ProtectedRoute(['office'])  → ManageSemesters
/office/temp-judges              → ProtectedRoute(['office'])  → CreateTempJudge

/teacher                         → ProtectedRoute(['teacher']) → TeacherDashboard
/teacher/courses                 → ProtectedRoute(['teacher']) → TeacherCourses
/teacher/assignments             → ProtectedRoute(['teacher']) → AssignmentManage
/teacher/lab-tests               → ProtectedRoute(['teacher']) → LabTestManage
/teacher/lecture-sheets          → ProtectedRoute(['teacher']) → LectureSheets

/student                         → ProtectedRoute(['student']) → StudentDashboard
/student/profile                 → ProtectedRoute(['student']) → StudentProfile
/student/courses                 → ProtectedRoute(['student']) → StudentCourses
/student/assignments             → ProtectedRoute(['student']) → StudentAssignments
/student/lab-tests               → ProtectedRoute(['student']) → StudentLabTests

/judge                           → ProtectedRoute(['temp_judge']) → JudgeDashboard
/judge/contests/create           → ProtectedRoute(['temp_judge']) → ContestCreate
/judge/contests/:id              → ProtectedRoute(['temp_judge']) → ContestManage
/judge/contests/:id/standings    → ProtectedRoute(['temp_judge']) → ContestStandings (judge view)
/judge/contests/:id/participants → ProtectedRoute(['temp_judge']) → ContestParticipants

/contest/:id                     → ProtectedRoute(['temp_participant']) → ContestView
/contest/:id/problems/:problemId → ProtectedRoute(['temp_participant']) → ContestProblem
/contest/:id/submit              → ProtectedRoute(['temp_participant']) → ContestSubmit
/contest/:id/standings           → ProtectedRoute(['temp_participant']) → ParticipantStandings
/contest/:id/clarifications      → ProtectedRoute(['temp_participant']) → AskClarification

/                                → RoleRedirect (role-based redirect component)
```

**`RoleRedirect` mappings:**
| Role | Redirect |
|------|---------|
| `office` | `/office` |
| `teacher` | `/teacher` |
| `student` | `/student` |
| `temp_judge` | `/judge` |
| `temp_participant` | `/contest` (goes to contest ID from user profile or first available) |

### 8.5 All 27 Pages

---

#### `LoginPage` — `/login`

**File:** `pages/LoginPage.tsx`

- Form: `username` + `password`
- zod validation (`z.object({username: z.string().min(1), password: z.string().min(1)})`)
- `POST /api/auth/login` → on success: `setAuth(user, token)` → role-based redirect
- If `user.role === 'student' && user.isFirstLogin === true` → redirect to `/student/profile`
- Otherwise → redirect based on role (using `RoleRedirect` logic)

---

#### `OfficeDashboard` — `/office`

**File:** `pages/office/OfficeDashboard.tsx`

- `GET /api/office/dashboard`
- Displays stats cards: total teachers, total students, active semesters, recent temp judges
- Recent activity section

---

#### `ManageTeachers` — `/office/teachers`

**File:** `pages/office/ManageTeachers.tsx`

- Form: `fullName`, `designation`, `email`, `phone`
- `POST /api/office/teachers` → shows returned `credentials.username` + `credentials.password` in a modal
- PDF download button: sends credentials to `POST /api/office/credentials/pdf` → decodes base64 → triggers download
- Table of all teachers with `GET /api/office/teachers`

---

#### `ManageStudents` — `/office/students`

**File:** `pages/office/ManageStudents.tsx`

- Bulk create form: `startId` (number), `endId` (number), `batchYear`, `deptCode`
- `POST /api/office/students/bulk` — max 200 at once, skips existing IDs
- Shows created vs skipped counts after creation
- PDF download for created credentials
- Filter table by batch: `GET /api/office/students?batch={batchYear}`

---

#### `ManageSemesters` — `/office/semesters`

**File:** `pages/office/ManageSemesters.tsx`

- Form: `name` (dropdown of 8 SemesterName values), `batchYear`, `startDate`, `endDate`
- `POST /api/office/semesters`
- List: `GET /api/office/semesters`
- "Set Current" button (calls appropriate endpoint)

---

#### `ManageCourses` — `/office/courses`

**File:** `pages/office/ManageCourses.tsx`

- Create course form: `courseCode`, `title`, `type`, `creditHours`, `semesterId`
- `POST /api/courses`
- List all courses: `GET /api/courses`
- Assign teachers and enroll students inline

---

#### `CreateTempJudge` — `/office/temp-judges`

**File:** `pages/office/CreateTempJudge.tsx`

> ⚠️ **Route Mismatch**: This page calls `GET /api/office/temp-judges` and `POST /api/office/temp-judges`, but the backend `OfficeController` uses `/api/office/judges`. See [Section 11](#11-known-route-mismatch--frontend-vs-backend).

- Create judge form: `accessFrom`, `accessUntil`, `notes`
- Shows returned credentials
- Extend access: inline `accessUntil` update for each judge
- PDF download for credentials

---

#### `TeacherDashboard` — `/teacher`

**File:** `pages/teacher/TeacherDashboard.tsx`

- `GET /api/courses/my` — lists teacher's assigned courses
- Unread notifications count from `GET /api/notifications`

---

#### `TeacherCourses` — `/teacher/courses`

**File:** `pages/teacher/TeacherCourses.tsx`

- Course grid from `GET /api/courses/my`
- Click course → side panel showing enrolled students (`GET /api/courses/:id/enrollments`) and lecture sheets

---

#### `AssignmentManage` — `/teacher/assignments`

**File:** `pages/teacher/AssignmentManage.tsx`

- Create assignment: `title`, `caption`, `courseId`, `deadline`, `allowLateSubmission`, `totalMarks`, links (dynamic array via `useFieldArray`)
- `POST /api/assignments`
- Course filter dropdown to show assignments: `GET /api/assignments/course/:courseId`
- Expandable rows showing submissions: `GET /api/assignments/:id/submissions`
- Grade form per submission: `score` + `feedback` → `PATCH /api/assignments/submissions/:submissionId/grade`

---

#### `LabTestManage` — `/teacher/lab-tests`

**File:** `pages/teacher/LabTestManage.tsx`

- Create lab test: `title`, `type` (verdict_based/non_verdict), `startTime`, `endTime`, `totalMarks`, `courseId`
- `POST /api/lab-tests`
- Add problems to test: `title`, `statement`, `marks`, `timeLimitMs`, `memoryLimitKb`, `sampleTestCases` (dynamic)
- Start/End buttons: `PATCH /api/lab-tests/:id/status` with `{status: 'running'|'ended'}`
- View and grade submissions: `GET /api/lab-tests/:id/submissions` → `PATCH /api/lab-tests/submissions/:id/grade`

---

#### `LectureSheets` — `/teacher/lecture-sheets`

**File:** `pages/teacher/LectureSheets.tsx`

- Course filter: `GET /api/courses/my`
- Post lecture sheet: `title`, `description`, links array (useFieldArray with `url` + `label`)
- `POST /api/courses/lecture-sheets`
- View sheets: `GET /api/courses/:courseId/lecture-sheets`

---

#### `StudentProfile` — `/student/profile`

**File:** `pages/student/StudentProfile.tsx`

> This page serves as the **first-login gate** for students.

- If `isFirstLogin === true`, the form is mandatory before accessing other pages
- Full profile form: `fullName`, `phone`, `email`, `dateOfBirth`, `fathersName`, `mothersName`, `presentAddress`, `permanentAddress`
- Profile photo upload: `POST /api/users/profile/photo` (multipart, field `photo`)
- Profile data save: `PATCH /api/users/profile` → sets `profileCompleted=true`, `isFirstLogin=false`
- On success: updates Zustand store + calls `POST /api/auth/first-login-done`

---

#### `StudentDashboard` — `/student`

**File:** `pages/student/StudentDashboard.tsx`

- Greeting with student's `fullName` (from Zustand store profile)
- Course count from `GET /api/courses/my`
- Unread notifications list from `GET /api/notifications`

---

#### `StudentCourses` — `/student/courses`

**File:** `pages/student/StudentCourses.tsx`

- Course grid: `GET /api/courses/my`
- Click course → lecture sheets viewer: `GET /api/courses/:courseId/lecture-sheets`
- Lecture sheet links displayed as clickable anchors

---

#### `StudentAssignments` — `/student/assignments`

**File:** `pages/student/StudentAssignments.tsx`

- Lists assignments for each enrolled course: `GET /api/assignments/course/:courseId`
- File drag-and-drop submission area
- Deadline display with late detection (if past deadline and `allowLateSubmission=true`, shows warning)
- `POST /api/assignments/:id/submit` (multipart, field `file`, optional `notes`)
- Grade display: shows `score / totalMarks` + feedback after grading

---

#### `StudentLabTests` — `/student/lab-tests`

**File:** `pages/student/StudentLabTests.tsx`

- Running lab tests: `GET /api/lab-tests/running`
- Countdown timer for `endTime` (red pulsing when < 10 minutes)
- Problem panel: `GET /api/lab-tests/:id/problems`
- ACE editor (`react-ace`) for code input
- Language selector dropdown
- File upload alternative to code editor (max 256KB)
- Submit: `POST /api/lab-tests/problems/:problemId/submit`
- Submission history: `GET /api/lab-tests/problems/:problemId/my-submissions`

---

#### `JudgeDashboard` — `/judge`

**File:** `pages/judge/JudgeDashboard.tsx`

- List all contests: `GET /api/contests`
- Problem bank count: `GET /api/contests/problems/mine`
- "Create Contest" button → navigate to `/judge/contests/create`

---

#### `ContestCreate` — `/judge/contests/create`

**File:** `pages/judge/ContestCreate.tsx`

**2-step wizard:**

**Step 1 — Problem Bank:**
- Create new problem: `title`, `statement`, `timeLimitMs`, `memoryLimitKb`, `sampleTestCases` (dynamic)
- `POST /api/contests/problems`
- View/select existing problems: `GET /api/contests/problems/mine`
- File uploads for input/output: `POST /api/contests/problems/:id/files`

**Step 2 — Contest Details:**
- `title`, `type` (icpc/score_based), `startTime`, `endTime`, `freezeTime`, selected `problemIds[]`
- `POST /api/contests` → navigate to `/judge/contests/:id`

---

#### `ContestManage` — `/judge/contests/:id`

**File:** `pages/judge/ContestManage.tsx`

- Contest info + status controls: `PATCH /api/contests/:id/status`
- Submissions tab: `GET /api/contests/:id/submissions/all`
  - Grade each: verdict dropdown + score input → `PATCH /api/contests/submissions/:id/grade`
- Clarifications tab: `GET /api/contests/:id/clarifications/pending`
  - Answer form → `PATCH /api/contests/clarifications/:id/answer`
- Announcements tab: `POST /api/contests/:id/announcements`
- Participants tab: link to `/judge/contests/:id/participants`
- Standings tab: link to `/judge/contests/:id/standings`

---

#### `ContestStandings` (judge) — `/judge/contests/:id/standings`

**File:** `pages/judge/ContestStandings.tsx`

- `GET /api/contests/:id/standings`
- ICPC: shows solved count, total penalty, per-problem attempts/penalty
- Score-based: shows total score per participant
- Freeze/Unfreeze button: `PATCH /api/contests/:id/freeze`
- Auto-refresh every 30 seconds

---

#### `ContestParticipants` — `/judge/contests/:id/participants`

**File:** `pages/judge/ContestParticipants.tsx`

- Bulk create: `count` input → `POST /api/contests/participants/bulk` with `{contestId, count}`
- Returns credentials list + base64 PDF
- PDF download triggers browser download
- Participant list display

---

#### `ContestView` — `/contest/:id`

**File:** `pages/participant/ContestView.tsx`

- Contest info: `GET /api/contests/:id`
- Countdown timer (red pulse animation when < 10 minutes remaining)
- Problem list tiles: click → `/contest/:id/problems/:problemId`
- `<AnnouncementModal contestId={id} />` — blocking modal for announcements
- Navigation: Problems, Submit, Standings, Clarifications

---

#### `ContestProblem` — `/contest/:id/problems/:problemId`

**File:** `pages/participant/ContestProblem.tsx`

- Loads problem statement from contest data
- Displays: `title`, `timeLimitMs`, `memoryLimitKb`, `statement`, `sampleTestCases`
- "Submit" button → navigates to `/contest/:id/submit?problemId={problemId}`

---

#### `ContestSubmit` — `/contest/:id/submit`

**File:** `pages/participant/ContestSubmit.tsx`

- Problem selector dropdown (from `GET /api/contests/:id`)
- Language selector (ProgrammingLanguage enum values)
- ACE editor (`react-ace`) for code entry
- File upload alternative (max 256KB)
- MVP badge displayed (indicating no execution, manual judging only)
- Submit: `POST /api/contests/:id/submit` (multipart)
- Submission history: `GET /api/contests/:id/my-submissions`

---

#### `ParticipantStandings` — `/contest/:id/standings`

**File:** `pages/participant/ContestStandings.tsx`

- `GET /api/contests/:id/standings`
- 🥇🥈🥉 medal icons for top 3
- ICPC table: rank | name | solved | penalty | per-problem columns
- Score-based table: rank | name | total score | per-problem score
- Auto-refresh every 60 seconds
- Shows frozen banner if `contest.isStandingFrozen === true`

---

#### `AskClarification` — `/contest/:id/clarifications`

**File:** `pages/participant/AskClarification.tsx`

- Ask question form: `question` text + optional `contestProblemId` (problem selector)
- `POST /api/contests/:id/clarifications`
- List own clarifications: `GET /api/contests/:id/clarifications/mine`
- Shows answer/broadcast status per clarification

---

## 9. Seed Script

**File:** `apps/api/src/seed.ts`

```typescript
// Standalone DataSource (not NestJS context)
const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  // ... same config as app.module.ts
  entities: [User, Student, Teacher, TempJudge, TempParticipant],
  synchronize: true,
});

// Creates OFFICE user if not exists
const password = process.env.OFFICE_SEED_PASSWORD || 'LabAssist@2024!';
// Checks if username 'office' exists, creates if not
```

**How to run:**
```bash
cd /home/dipra/SystemProject/apps/api
npm run seed
```

**Result (already executed):**
- Username: `office`
- Password: `LabAssist@2024!`
- Role: `UserRole.OFFICE`
- `isFirstLogin: false`
- `isActive: true`

---

## 10. Critical Bug Fixes Applied

During development, the following bugs were encountered and fixed. A new agent continuing this work must not reintroduce these issues.

| # | Bug | Fix Applied |
|---|-----|------------|
| 1 | `jwt.signOptions.expiresIn` TypeScript strict type mismatch | Cast `expiresIn` value as `any` |
| 2 | `secretOrKey` typed as `string \| undefined` in JWT strategy | Added `?? ''` fallback: `secretOrKey: config.get<string>('JWT_SECRET') ?? ''` |
| 3 | `UserRole` import paths in guards/decorators | From inside `modules/auth/`, path is `../../../common/enums/role.enum` |
| 4 | `ContestStatus.UPCOMING` used in code | Does NOT exist; use `ContestStatus.SCHEDULED` |
| 5 | `Problem.createdById` field referenced | Actual field is `authorId` |
| 6 | `ContestClarification.askedById` field referenced | Actual field is `participantId` |
| 7 | `SubmissionStatus.JUDGED` used | Does NOT exist; use `SubmissionStatus.MANUAL_REVIEW` |
| 8 | Submissions ordered by `createdAt` | Actual timestamp field is `submittedAt` |
| 9 | `LabTestStatus` imported from `common/enums` | It is a LOCAL enum in `lab-test.entity.ts`; import from there |
| 10 | `LabTest` referenced with `createdById` | `LabTest` entity has NO `createdById` field |
| 11 | `notifications.createBulk` called with 6 arguments | Signature is `createBulk(userIds: string[], payload: {...})` — only 2 args |
| 12 | PDFKit used with ES `import PDFDocument from 'pdfkit'` | Must use `const PDFDocument = require('pdfkit') as typeof import('pdfkit')`. Stream chunks typed as `Buffer`. |
| 13 | Student field `fatherName` used | Actual field is `fathersName` (with 's') |
| 14 | Student field `address` used | Fields are `presentAddress` and `permanentAddress` |
| 15 | `@Column({ nullable: true })` without `type` on many columns | Global fix: all changed to `@Column({ type: 'varchar', nullable: true })` to prevent TypeORM `"Data type Object not supported"` error |
| 16 | `Problem` entity missing `ContestProblem` import for `@OneToMany` | Explicit import of `ContestProblem` entity added to the relation decorator |
| 17 | `LabTestStatus.STARTED` and `LabTestStatus.FINISHED` referenced | Actual values are `LabTestStatus.RUNNING` and `LabTestStatus.ENDED` |

---

## 11. Known Route Mismatch — Frontend vs Backend

**Issue:** The frontend `CreateTempJudge` page at `/office/temp-judges` calls:
- `GET /api/office/temp-judges` → **does NOT exist on backend**
- `POST /api/office/temp-judges` → **does NOT exist on backend**

The backend `OfficeController` uses:
- `GET /api/office/judges`
- `POST /api/office/judges`
- `PATCH /api/office/judges/:id/extend`

**Resolution options (pick one):**
1. **Fix frontend** (recommended): Change all API calls in `CreateTempJudge.tsx` from `/office/temp-judges` to `/office/judges`
2. **Add alias in backend**: Add a second `@Controller` or `@Get('temp-judges')` aliases in `OfficeController`
3. **Add redirect middleware**: NestJS middleware mapping `/office/temp-judges` → `/office/judges`

**Status:** Not yet fixed. The page will return 404 errors until resolved.

---

## 12. MVP Constraints & Future Work

### What is MVP and what is NOT implemented

| Feature | MVP Status | Notes |
|---------|-----------|-------|
| Code display in ACE editor | ✅ Done | Display + submit only |
| Code execution / judge | ❌ Not implemented | Webhook endpoints exist (`PATCH /submissions/:id/result`) for future DOMJudge integration |
| Automated judging | ❌ Not implemented | `submissionStatus` and `manualVerdict` fields ready; judge sets manually |
| `judgeToken` field | ✅ Exists in DB | For future automated judge webhook authentication |
| Email for all notifications | ❌ Only 2 types | Only `ASSIGNMENT_POSTED` and `LECTURE_SHEET_POSTED` send emails |
| Real-time leaderboard | ⚠️ Partial | Auto-refresh polling (30s/60s); no WebSocket push for standings |
| File I/O for problems | ✅ Upload exists | `POST /api/contests/problems/:id/files` and similar for lab tests |
| Password reset | ❌ Not implemented | Manual via Office for now |
| Student self-registration | ❌ Not implemented | Office creates all accounts |
| Mobile responsive | ⚠️ Basic | TailwindCSS used but no mobile-specific design tested |

### Future Integration Points

1. **Automated Judge**: `PATCH /api/lab-tests/submissions/:id/result` and `PATCH /api/contests/submissions/:id/result` — no auth, token-based. Body: `{verdict, executionTimeMs, memoryUsedKb, judgeToken}`.

2. **Contest Status Automation**: Currently manual (`PATCH /api/contests/:id/status`). Could add a cron job to auto-transition `SCHEDULED → RUNNING → ENDED` based on `startTime`/`endTime`.

3. **Freeze Automation**: `freezeTime` field exists on Contest. Currently freeze is manual toggle. Could auto-freeze at `freezeTime`.

4. **Email Queue**: Currently synchronous Nodemailer. For bulk notifications (e.g., enrolling 200 students), a queue (Bull/BullMQ) should be added.

---

## 13. Database Notes

- **PostgreSQL** database named `labassist`
- **User**: `labassist_user`, **Password**: `labassist_pass`
- **TypeORM `synchronize: true`** in development → schema auto-created/updated on every `start:dev`
- **No migration files** — schema is managed by TypeORM synchronize
- All UUIDs generated by TypeORM `@PrimaryGeneratedColumn('uuid')`
- All timestamps use `timestamptz` (timezone-aware)
- jsonb columns: `LectureSheet.links`, `LabTestProblem.sampleTestCases`, `Problem.sampleTestCases`

### Table Naming
TypeORM default: entity name → snake_case table name
- `User` → `user`
- `TempJudge` → `temp_judge`
- `LabTestProblem` → `lab_test_problem`
- `ContestSubmission` → `contest_submission`
- etc.

---

## 14. Security Notes

- **JWT secret**: Change `JWT_SECRET` in production to a strong random value
- **bcrypt rounds=12**: Applied consistently via `User` entity lifecycle hooks
- **File upload limits**: 10MB for assignments, 256KB for code submissions
- **`select: false` on password**: `User.password` column excluded from default SELECT queries; must be explicitly selected when needed for comparison
- **CORS**: Restricted to `FRONTEND_URL` only
- **Validation pipe**: `whitelist: true` strips unknown properties; `forbidNonWhitelisted: true` throws on extra properties
- **Role guards**: Every sensitive endpoint has `@Roles(UserRole.X)` + `RolesGuard`
- **`isActive` check**: Should be added to `JwtAuthGuard` or JWT strategy to prevent deactivated users from using valid tokens (not currently implemented in MVP)
- **TempJudge/TempParticipant `expiresAt`**: Expiry not currently enforced in JWT validation — future work to add expiry check in strategy

---

*End of LabAssist README — Generated as AI Agent Handoff Document*

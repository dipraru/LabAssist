import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import {
  CreateCourseDto,
  UpdateCourseDto,
  EnrollStudentsDto,
  AddTeacherToCourseDto,
  CreateScheduleDto,
  CreateLectureSheetDto,
  UpdateLectureSheetDto,
  CreateCoursePostDto,
  CreateCoursePostCommentDto,
} from './dto/courses.dto';

@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Post()
  createCourse(@Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(dto);
  }

  @Get()
  getAllCourses() {
    return this.coursesService.getAllCourses();
  }

  @Get('my')
  getMyCourses(@CurrentUser() user: { id: string; role: string }) {
    if (user.role === UserRole.TEACHER)
      return this.coursesService.getCoursesByTeacher(user.id);
    if (user.role === UserRole.STUDENT)
      return this.coursesService.getCoursesByStudent(user.id);
    return this.coursesService.getAllCourses();
  }

  @Get(':id')
  getCourse(@Param('id') id: string) {
    return this.coursesService.getCourseById(id);
  }

  @Get(':id/posts')
  getCoursePosts(
    @Param('id') courseId: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.getCoursePosts(courseId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Post(':id/posts')
  createCoursePost(
    @Param('id') courseId: string,
    @Body() dto: CreateCoursePostDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.createCoursePost(courseId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Post('posts/:postId/comments')
  addCoursePostComment(
    @Param('postId') postId: string,
    @Body() dto: CreateCoursePostCommentDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.addCoursePostComment(postId, dto, user);
  }

  @Get(':id/enrollments')
  getEnrollments(@Param('id') id: string) {
    return this.coursesService.getEnrollmentsForCourse(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Post('enroll')
  enrollStudents(
    @Body() dto: EnrollStudentsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.coursesService.enrollStudents(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Delete(':courseId/students/:studentUserId')
  removeStudent(
    @Param('courseId') courseId: string,
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.coursesService.removeEnrollment(courseId, studentUserId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Post('teachers')
  addTeacher(@Body() dto: AddTeacherToCourseDto) {
    return this.coursesService.addTeacherToCourse(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Delete(':courseId/teachers/:teacherId')
  removeTeacher(
    @Param('courseId') courseId: string,
    @Param('teacherId') teacherId: string,
  ) {
    return this.coursesService.removeTeacherFromCourse(courseId, teacherId);
  }

  // Schedules
  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Post('schedules')
  createSchedule(@Body() dto: CreateScheduleDto) {
    return this.coursesService.createSchedule(dto);
  }

  @Get('schedules/all')
  getSchedules(
    @Query('courseId') courseId?: string,
    @Query('batch') batchYear?: string,
  ) {
    return this.coursesService.getSchedules(courseId, batchYear);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Delete('schedules/:id')
  deleteSchedule(@Param('id') id: string) {
    return this.coursesService.deleteSchedule(id);
  }

  // Lecture sheets
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Post('lecture-sheets')
  createLectureSheet(
    @Body() dto: CreateLectureSheetDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.coursesService.createLectureSheet(dto, user.id);
  }

  @Get(':courseId/lecture-sheets')
  getLectureSheets(@Param('courseId') courseId: string) {
    return this.coursesService.getLectureSheets(courseId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Patch('lecture-sheets/:id')
  updateLectureSheet(
    @Param('id') id: string,
    @Body() dto: UpdateLectureSheetDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.coursesService.updateLectureSheet(id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Delete('lecture-sheets/:id')
  deleteLectureSheet(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.coursesService.deleteLectureSheet(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Patch(':id')
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.updateCourse(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OFFICE)
  @Delete(':id')
  async deleteCourse(@Param('id') id: string) {
    await this.coursesService.deleteCourse(id);
    return { success: true };
  }
}

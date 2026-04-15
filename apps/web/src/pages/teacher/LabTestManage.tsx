import { AppShell } from '../../components/AppShell';
import { TeacherLabActivityManager } from './TeacherLabActivityManager';

export function LabTestManage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1560px]">
        <TeacherLabActivityManager syncSearchParams />
      </div>
    </AppShell>
  );
}

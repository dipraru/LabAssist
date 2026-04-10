import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';

const schema = z
  .object({
    currentPassword: z.string().min(6, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all';
const labelClass =
  'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

export function ChangePasswordPage() {
  const { user } = useAuthStore();
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (payload: FormData) =>
      api.patch('/auth/change-password', {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    onSuccess: () => {
      toast.success('Password changed successfully');
      form.reset();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to change password'),
  });

  return (
    <AppShell>
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
            <div className="mb-8 flex items-start gap-4">
              <div className="rounded-2xl bg-indigo-50 p-3">
                <LockKeyhole size={20} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Change Password</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Update the password for the currently signed-in {user?.role ?? 'account'} account.
                </p>
              </div>
            </div>

            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-5"
            >
              <div>
                <label className={labelClass}>Current Password</label>
                <input
                  type="password"
                  {...form.register('currentPassword')}
                  className={inputClass}
                  placeholder="Enter current password"
                />
                {form.formState.errors.currentPassword && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {form.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>New Password</label>
                  <input
                    type="password"
                    {...form.register('newPassword')}
                    className={inputClass}
                    placeholder="Create new password"
                  />
                  {form.formState.errors.newPassword && (
                    <p className="mt-1.5 text-xs text-red-500">
                      {form.formState.errors.newPassword.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Confirm Password</label>
                  <input
                    type="password"
                    {...form.register('confirmPassword')}
                    className={inputClass}
                    placeholder="Repeat new password"
                  />
                  {form.formState.errors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-500">
                      {form.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  Use at least 6 characters and choose something you do not reuse elsewhere.
                </div>
              </div>

              <button
                type="submit"
                disabled={form.formState.isSubmitting || mutation.isPending}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {form.formState.isSubmitting || mutation.isPending
                  ? 'Updating...'
                  : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

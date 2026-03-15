import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { AppShell } from '../../components/AppShell';
import { User, Upload, Pencil } from 'lucide-react';

const schema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  phone: z.string().min(6).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  dateOfBirth: z.string().optional(),
  fathersName: z.string().optional(),
  mothersName: z.string().optional(),
  presentAddress: z.string().optional(),
  permanentAddress: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});
type FormData = z.infer<typeof schema>;

export function StudentProfile() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const isFirstLogin = Boolean(user?.isFirstLogin);
  const [isEditing, setIsEditing] = useState(isFirstLogin);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>((user?.profile as any)?.profilePhoto ?? null);

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => api.get('/users/profile').then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      fathersName: '',
      mothersName: '',
      presentAddress: '',
      permanentAddress: '',
      gender: 'male',
    },
  });

  useEffect(() => {
    const src = (profile ?? user?.profile ?? {}) as any;
    if (!src) return;

    reset({
      fullName: src.fullName ?? '',
      phone: src.phone ?? '',
      email: src.email ?? '',
      dateOfBirth: src.dateOfBirth ? String(src.dateOfBirth).slice(0, 10) : '',
      fathersName: src.fathersName ?? '',
      mothersName: src.mothersName ?? '',
      presentAddress: src.presentAddress ?? '',
      permanentAddress: src.permanentAddress ?? '',
      gender: src.gender ?? 'male',
    });

    if (!photoFile) {
      setPhotoPreview(src.profilePhoto ?? null);
    }
  }, [profile, user?.profile, reset, photoFile]);

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => api.patch('/users/profile', d),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to save profile'),
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('photo', file);
      return api.post('/users/profile/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Photo upload failed'),
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (d: FormData) => {
    await updateMutation.mutateAsync(d);
    if (photoFile) await photoMutation.mutateAsync(photoFile);
    if (isFirstLogin) {
      try {
        await api.post('/auth/first-login-done');
      } catch {
        // non-blocking: profile updates should still be preserved
      }
    }

    // Re-fetch user profile and sync auth store
    try {
      const res = await api.get('/users/profile');
      if (user) {
        setUser({
          ...user,
          isFirstLogin: false,
          profile: res.data,
        });
      }
    } catch {
      // avoid blocking user on profile re-fetch failures
    }

    toast.success(isFirstLogin ? 'Profile saved! Welcome to LabAssist.' : 'Profile updated successfully.');
    setPhotoFile(null);
    setIsEditing(false);
    if (isFirstLogin) {
      navigate('/student');
    }
  };

  const currentProfile = (profile ?? user?.profile ?? {}) as any;

  const renderProfileForm = () => (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center border-2 border-slate-200">
          {photoPreview ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" /> : <User size={24} className="text-slate-400" />}
        </div>
        <label className="cursor-pointer flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
          <Upload size={14} /> Upload Photo
          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
          <input {...register('fullName')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input type="email" {...register('email')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
          <input {...register('phone')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
          <input type="date" {...register('dateOfBirth')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
          <select {...register('gender')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Father's Name</label>
          <input {...register('fathersName')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mother's Name</label>
          <input {...register('mothersName')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Present Address</label>
          <textarea {...register('presentAddress')} rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Permanent Address</label>
          <textarea {...register('permanentAddress')} rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={isSubmitting}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {isSubmitting ? 'Saving...' : isFirstLogin ? 'Save & Continue' : 'Save Changes'}
        </button>
        {!isFirstLogin && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              reset({
                fullName: currentProfile.fullName ?? '',
                phone: currentProfile.phone ?? '',
                email: currentProfile.email ?? '',
                dateOfBirth: currentProfile.dateOfBirth ? String(currentProfile.dateOfBirth).slice(0, 10) : '',
                fathersName: currentProfile.fathersName ?? '',
                mothersName: currentProfile.mothersName ?? '',
                presentAddress: currentProfile.presentAddress ?? '',
                permanentAddress: currentProfile.permanentAddress ?? '',
                gender: currentProfile.gender ?? 'male',
              });
              setPhotoFile(null);
              setPhotoPreview(currentProfile.profilePhoto ?? null);
            }}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  if (isFirstLogin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-md p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="text-indigo-600" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Complete Your Profile</h1>
            <p className="text-slate-500 text-sm mt-1">Please fill in your details before continuing</p>
          </div>
          {renderProfileForm()}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
            <p className="text-slate-500 text-sm mt-1">View your details and update them when needed.</p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <Pencil size={14} /> Update Profile
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            {renderProfileForm()}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-full bg-slate-100 overflow-hidden border-2 border-slate-200 flex items-center justify-center">
                {currentProfile.profilePhoto ? (
                  <img src={String(currentProfile.profilePhoto)} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={28} className="text-slate-400" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{currentProfile.fullName || user?.username || 'Student'}</h2>
                <p className="text-sm text-slate-500">{currentProfile.email || 'No email set'}</p>
              </div>
            </div>

            {isProfileLoading ? (
              <p className="text-sm text-slate-500">Loading profile...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <Info label="Full Name" value={currentProfile.fullName} />
                <Info label="Email" value={currentProfile.email} />
                <Info label="Phone" value={currentProfile.phone} />
                <Info label="Gender" value={currentProfile.gender} />
                <Info label="Date of Birth" value={currentProfile.dateOfBirth ? String(currentProfile.dateOfBirth).slice(0, 10) : undefined} />
                <Info label="Father's Name" value={currentProfile.fathersName} />
                <Info label="Mother's Name" value={currentProfile.mothersName} />
                <Info label="Present Address" value={currentProfile.presentAddress} />
                <Info label="Permanent Address" value={currentProfile.permanentAddress} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/70">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-slate-900">{value && String(value).trim() ? String(value) : 'Not provided'}</p>
    </div>
  );
}

import { FileStack, Sparkles } from 'lucide-react';
import { AppShell } from '../../components/AppShell';

export function ApplicationsPage() {
  return (
    <AppShell>
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-8 py-10 text-white">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <FileStack size={24} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Applications</h1>
                  <p className="mt-1 text-sm text-slate-200">
                    Central space for future office application workflows and approval pipelines.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-8 py-8">
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Workspace Ready</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      The menu entry is now available and routed. This page is ready to be extended with real application handling whenever that workflow is defined.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

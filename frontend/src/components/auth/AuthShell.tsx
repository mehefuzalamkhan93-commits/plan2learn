import Link from 'next/link';
import { ReactNode } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface AuthShellProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export default function AuthShell({ title, description, footer, children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_50%_18%,rgba(124,140,255,0.11),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Smart Learning Planner
        </Link>

        <div className="rounded-xl border border-white/[0.09] bg-zinc-900/65 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-300/15 bg-indigo-400/[0.08] text-indigo-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 border-t border-white/[0.07] pt-5 text-center text-sm text-zinc-400">
            {footer}
          </div>
        </div>
      </div>
    </main>
  );
}
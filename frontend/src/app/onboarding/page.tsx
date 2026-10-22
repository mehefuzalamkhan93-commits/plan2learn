'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { onboardingAPI } from '@/services/api';

const educationLevels = ['High School', 'Undergraduate', 'Postgraduate', 'Other'];

const indianBoards = [
  'CBSE',
  'ICSE / ISC',
  'West Bengal Board (WBCHSE / WBBSE)',
  'Maharashtra State Board (MSBSHSE)',
  'Karnataka State Board (KSEEB / PU)',
  'Tamil Nadu State Board',
  'Uttar Pradesh State Board (UPMSP)',
  'Telangana State Board (TSBIE)',
  'Andhra Pradesh State Board (BIEAP)',
  'Kerala State Board (DHSE)',
  'Gujarat State Board (GSEB)',
  'Rajasthan State Board (RBSE)',
  'Madhya Pradesh State Board (MPBSE)',
  'Bihar State Board (BSEB)',
  'Punjab State Board (PSEB)',
  'Odisha State Board (CHSE)',
  'Assam State Board (AHSEC)',
  'NIOS (National Open School)',
  'IB (International Baccalaureate)',
  'Cambridge (IGCSE / A-Level)',
  'Other State Board',
  'Other / Custom',
];

export default function OnboardingPage() {
  const router = useRouter();
  const [educationLevel, setEducationLevel] = useState('');
  const [boardCurriculum, setBoardCurriculum] = useState('');
  const [customBoard, setCustomBoard] = useState('');
  const [gradeClass, setGradeClass] = useState('');
  const [subjects, setSubjects] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const targetSubjects = Array.from(
      new Set(subjects.split(',').map((subject) => subject.trim()).filter(Boolean))
    );
    if (targetSubjects.length === 0) {
      setError('Add at least one subject to continue.');
      return;
    }

    const finalBoard = (boardCurriculum === 'Other / Custom' ? customBoard : boardCurriculum).trim();
    if (!finalBoard) {
      setError('Please select or specify your board/curriculum.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await onboardingAPI.saveBaseline({
        education_level: educationLevel,
        board_curriculum: finalBoard,
        grade_class: gradeClass.trim(),
        target_subjects: targetSubjects,
      });
      router.replace(response.data.next_route);
    } catch (requestError) {
      const message =
        typeof requestError === 'object' && requestError !== null && 'response' in requestError
          ? (requestError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(message || 'Unable to save your academic setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_50%_16%,rgba(124,140,255,0.1),transparent_58%)]" />
      <section className="relative z-10 w-full max-w-xl rounded-xl border border-white/[0.08] bg-zinc-900/60 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-300/15 bg-indigo-400/[0.08] text-indigo-200">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-xs font-mono uppercase tracking-[0.16em] text-indigo-200/80">Your starting point</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100 sm:text-3xl">Set your academic baseline</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Just the essentials for now. You can tell your study story in the AI Assistant next.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>Education level</span>
            <select
              required
              value={educationLevel}
              onChange={(event) => setEducationLevel(event.target.value)}
              className="h-11 w-full rounded-lg border border-white/[0.09] bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none focus:border-indigo-300/35"
            >
              <option value="" disabled className="bg-zinc-900 text-zinc-400">Select your level</option>
              {educationLevels.map((level) => <option key={level} value={level} className="bg-zinc-900 text-zinc-100">{level}</option>)}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>Board or curriculum</span>
            <select
              required
              value={boardCurriculum}
              onChange={(event) => {
                setBoardCurriculum(event.target.value);
                if (event.target.value !== 'Other / Custom') {
                  setCustomBoard('');
                }
              }}
              className="h-11 w-full rounded-lg border border-white/[0.09] bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none focus:border-indigo-300/35"
            >
              <option value="" disabled className="bg-zinc-900 text-zinc-400">Select your school board</option>
              {indianBoards.map((board) => (
                <option key={board} value={board} className="bg-zinc-900 text-zinc-100">{board}</option>
              ))}
            </select>
          </label>

          {boardCurriculum === 'Other / Custom' && (
            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span>Specify your board / university</span>
              <input
                required
                minLength={2}
                maxLength={50}
                value={customBoard}
                onChange={(event) => setCustomBoard(event.target.value)}
                placeholder="e.g. Goa Board, Uttarakhand Board, University"
                className="h-11 w-full rounded-lg border border-white/[0.09] bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-300/35"
              />
            </label>
          )}

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>Class or grade</span>
            <input required minLength={2} maxLength={50} value={gradeClass}
              onChange={(event) => setGradeClass(event.target.value)}
              placeholder="e.g. Class 12, Grade 11"
              className="h-11 w-full rounded-lg border border-white/[0.09] bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-300/35" />
          </label>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>Subjects</span>
            <input required value={subjects} onChange={(event) => setSubjects(event.target.value)}
              placeholder="Mathematics, Physics, Chemistry"
              className="h-11 w-full rounded-lg border border-white/[0.09] bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-300/35" />
          </label>

          {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

          <button type="submit" disabled={isSubmitting}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving…' : 'Continue to AI Assistant'}
          </button>
        </form>
      </section>
    </main>
  );
}

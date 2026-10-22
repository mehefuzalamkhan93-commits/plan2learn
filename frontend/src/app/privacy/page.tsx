import type { Metadata } from 'next';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { ArrowLeft, ShieldCheck, Lock, Eye, Trash2, Key, Database } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Plan2Learn',
  description: 'Privacy Policy for Plan2Learn. Learn how we handle, protect, and respect your personal data and Google user data.',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = 'October 22, 2026';

  return (
    <div className="min-h-screen bg-[#080B14] text-zinc-100 selection:bg-indigo-500/30 selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#080B14]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <AppLogo size="sm" />
            <span className="text-lg font-bold bg-gradient-to-r from-white via-zinc-200 to-indigo-300 bg-clip-text text-transparent">
              Plan2Learn
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/terms"
              className="text-zinc-400 hover:text-zinc-200 transition-colors hidden sm:inline-block"
            >
              Terms of Service
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs sm:text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Privacy & Data Protection</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Privacy Policy
          </h1>
          <p className="text-sm text-zinc-400">
            Last updated: <span className="text-zinc-300 font-medium">{lastUpdated}</span> • Effective immediately
          </p>
        </div>

        {/* Highlight Banner for Google Limited Use */}
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-5 mb-8 text-sm leading-relaxed text-indigo-200">
          <div className="font-semibold text-white mb-1.5 flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" />
            <span>Google API Services User Data Policy Compliance</span>
          </div>
          <p>
            Plan2Learn&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
              className="underline font-medium text-white hover:text-indigo-300"
            >
              Google API Services User Data Policy
            </a>, including the <strong>Limited Use</strong> requirements.
          </p>
        </div>

        {/* Content Box */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#0E121E]/70 p-6 sm:p-10 space-y-8 text-sm sm:text-base leading-relaxed text-zinc-300 shadow-xl">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">01.</span> Introduction
            </h2>
            <p>
              Plan2Learn (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) takes your privacy seriously. This Privacy Policy describes how we collect, use, process, and protect your information when you access our smart study planning application at{' '}
              <a href="https://plan2learn.online" className="text-indigo-400 underline underline-offset-2">
                https://plan2learn.online
              </a>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">02.</span> Information We Collect
            </h2>
            <p>We only collect information necessary to provide and personalize your study experience:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account & Profile Information:</strong> When you register via email or Google Sign-In, we receive your email address, name, and optional profile picture.
              </li>
              <li>
                <strong>Study Preferences & Plans:</strong> Subjects, target exam dates, preferred study hours, and generated tasks to personalize your schedule.
              </li>
              <li>
                <strong>Device & Session Tokens:</strong> Cryptographic tokens stored in secure HTTP-only cookies to keep your account authenticated and synchronize progress between up to two personal devices.
              </li>
              <li>
                <strong>User Study Materials:</strong> Documents, notes, or topics you explicitly submit or import to generate summaries, flashcards, or study plans.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">03.</span> Google User Data & Drive Integration
            </h2>
            <p>
              If you choose to authenticate with Google or connect your Google Drive:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Google Sign-In:</strong> We use your Google profile (email, name, avatar) strictly to identify and authenticate your account.
              </li>
              <li>
                <strong>Google Drive Access:</strong> We only access files that you explicitly choose to import into Plan2Learn. We do not scan, browse, or read unrelated documents on your Google Drive.
              </li>
              <li>
                <strong>No Third-Party Advertising:</strong> We never share, sell, or license Google user data to data brokers, advertisers, or third-party marketing services.
              </li>
              <li>
                <strong>No AI Training on Private Data:</strong> Your Google Drive files and private study notes are never used to train public machine learning or foundational AI models.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">04.</span> How We Use Your Information
            </h2>
            <p>We use the collected information solely for:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Creating, calculating, and adapting your personalized study schedules.</li>
              <li>Sending secure email verification codes (OTP) when logging in.</li>
              <li>Syncing tasks and progress between your authorized devices.</li>
              <li>Maintaining application performance, preventing fraudulent activity, and ensuring system stability.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">05.</span> Data Security & Storage
            </h2>
            <p>
              We implement industry-standard encryption protocols to protect your personal information:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>All web traffic is transmitted strictly over encrypted HTTPS/TLS connections.</li>
              <li>Database records are stored in secure cloud environments with encrypted at-rest storage.</li>
              <li>Authentication tokens are securely signed using high-entropy JWT secrets and transmitted in secure cookies.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">06.</span> Your Rights, Revocation & Data Deletion
            </h2>
            <p>
              You maintain complete control over your data:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Revoke Google Access:</strong> You can disconnect Plan2Learn from your Google account at any time by visiting{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Google Account Permissions
                </a>.
              </li>
              <li>
                <strong>Data Deletion Request:</strong> You can request full deletion of your account, profile, and all associated study data at any time by emailing us at{' '}
                <span className="text-indigo-400 font-mono">mehefuzalamkhan93@gmail.com</span>. We will permanently delete your records within 7 business days.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">07.</span> Contact Us
            </h2>
            <p>
              If you have any questions or feedback regarding this Privacy Policy or our data practices, please contact:
            </p>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-sm space-y-1">
              <div><strong className="text-zinc-200">Application:</strong> Plan2Learn</div>
              <div><strong className="text-zinc-200">Website:</strong> https://plan2learn.online</div>
              <div><strong className="text-zinc-200">Developer Contact:</strong> mehefuzalamkhan93@gmail.com</div>
              <div><strong className="text-zinc-200">Email Notifications:</strong> noreply@plan2learn.online</div>
            </div>
          </section>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-zinc-500">
          &copy; {new Date().getFullYear()} Plan2Learn. All rights reserved. •{' '}
          <Link href="/terms" className="text-zinc-400 hover:text-zinc-200 underline">
            Terms of Service
          </Link>
        </div>
      </main>
    </div>
  );
}

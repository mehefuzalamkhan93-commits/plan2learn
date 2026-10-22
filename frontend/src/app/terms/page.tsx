import type { Metadata } from 'next';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { ArrowLeft, Shield, FileText, CheckCircle2, Lock, Scale, HelpCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | Plan2Learn',
  description: 'Terms of Service and Conditions of Use for Plan2Learn AI-powered learning and study planning platform.',
};

export default function TermsPage() {
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
              href="/privacy"
              className="text-zinc-400 hover:text-zinc-200 transition-colors hidden sm:inline-block"
            >
              Privacy Policy
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-medium mb-4">
            <Scale className="w-3.5 h-3.5" />
            <span>Legal Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-zinc-400">
            Last updated: <span className="text-zinc-300 font-medium">{lastUpdated}</span> • Effective immediately
          </p>
        </div>

        {/* Content Box */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#0E121E]/70 p-6 sm:p-10 space-y-8 text-sm sm:text-base leading-relaxed text-zinc-300 shadow-xl">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">01.</span> Acceptance of Terms
            </h2>
            <p>
              Welcome to <strong>Plan2Learn</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), accessible via{' '}
              <a href="https://plan2learn.online" className="text-indigo-400 underline underline-offset-2">
                https://plan2learn.online
              </a>. By accessing or using our website, AI study tools, multi-device synchronization, and mobile interfaces (collectively, the &ldquo;Service&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
            <p>
              If you do not agree to these Terms, you must immediately discontinue use of the Service.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">02.</span> Description of the Service
            </h2>
            <p>
              Plan2Learn is an AI-powered smart learning and study planning platform designed to help students and self-learners organize study schedules, extract insights from learning materials, track exam readiness, and synchronize study plans seamlessly across authorized personal devices.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">03.</span> User Accounts & Authentication
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Eligibility:</strong> You must be at least 13 years old (or the applicable minimum age of digital consent in your jurisdiction) to use Plan2Learn.
              </li>
              <li>
                <strong>Authentication:</strong> Users may register using email with secure One-Time Passcode (OTP) verification or via Google OAuth 2.0 authentication.
              </li>
              <li>
                <strong>Account Security:</strong> You are responsible for safeguarding your login credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized access.
              </li>
              <li>
                <strong>Device Syncing:</strong> Users may sync up to two active concurrent devices at any given time to protect against unauthorized account sharing and abuse.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">04.</span> Third-Party Integrations & Google Sign-In
            </h2>
            <p>
              Plan2Learn offers optional authentication with third-party services, including <strong>Google Sign-In</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                When you connect or sign in with your Google Account, you authorize Plan2Learn to access your basic profile information (email address and name) solely to authenticate and secure your account.
              </li>
              <li>
                <strong>Google Limited Use Compliance:</strong> Plan2Learn&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Google API Services User Data Policy
                </a>, including the Limited Use requirements.
              </li>
              <li>
                You can revoke Plan2Learn&apos;s access to your Google account at any time through your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Google Security Permissions
                </a>.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">05.</span> User Content & Intellectual Property
            </h2>
            <p>
              You retain full ownership and intellectual property rights over any study notes, documents, schedules, or files you upload to the platform. By uploading content, you grant Plan2Learn a limited license solely to process and analyze the content to generate study plans and provide the requested features to you.
            </p>
            <p>
              We do <strong>not</strong> sell your content or use your private study documents to train general commercial AI models.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">06.</span> Acceptable Use Policy
            </h2>
            <p>You agree not to use Plan2Learn to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Violate any applicable local, national, or international law or regulation.</li>
              <li>Upload malicious code, viruses, or harmful automated scripts.</li>
              <li>Attempt to reverse-engineer, decompile, or compromise the security of our backend APIs.</li>
              <li>Harass, abuse, or infringe on the privacy or intellectual property rights of others.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">07.</span> Disclaimers & Limitation of Liability
            </h2>
            <p>
              The Service and AI-generated study schedules are provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind. While our algorithms strive for educational precision, AI recommendations may occasionally contain inaccuracies.
            </p>
            <p>
              To the maximum extent permitted by law, Plan2Learn shall not be liable for any indirect, incidental, or consequential damages resulting from your use or inability to use the Service.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3 border-t border-zinc-800/60 pt-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400 font-mono text-base">08.</span> Contact Information
            </h2>
            <p>
              For any questions, concerns, or legal inquiries regarding these Terms of Service, please reach out to us at:
            </p>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-sm space-y-1">
              <div><strong className="text-zinc-200">Application:</strong> Plan2Learn</div>
              <div><strong className="text-zinc-200">Website:</strong> https://plan2learn.online</div>
              <div><strong className="text-zinc-200">Developer Contact:</strong> mehefuzalamkhan93@gmail.com</div>
              <div><strong className="text-zinc-200">Support Email:</strong> noreply@plan2learn.online</div>
            </div>
          </section>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-zinc-500">
          &copy; {new Date().getFullYear()} Plan2Learn. All rights reserved. •{' '}
          <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200 underline">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  );
}

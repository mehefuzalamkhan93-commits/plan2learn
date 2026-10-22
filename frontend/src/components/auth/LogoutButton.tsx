'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authAPI } from '@/services/api';

export default function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authAPI.logout();
    } finally {
      try {
        sessionStorage.removeItem('p2l_session_splash_shown');
      } catch {}
      router.replace('/login');
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
}
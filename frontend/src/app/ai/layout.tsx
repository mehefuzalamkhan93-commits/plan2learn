import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
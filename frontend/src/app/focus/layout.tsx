import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
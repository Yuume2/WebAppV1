import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Create account · AI Workspace V1',
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}

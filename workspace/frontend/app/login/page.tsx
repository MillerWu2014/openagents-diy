'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Login was removed. Send people into the local project. */
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return null;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Sign-in callbacks are unused. Open the local project. */
export default function AuthCallbackPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return null;
}

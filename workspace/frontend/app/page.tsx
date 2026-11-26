'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api-base';

/** Open the single local project. No landing page and no account picker. */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/v1/local/project`, { cache: 'no-store' });
        const body = await res.json();
        const project = body.data || body;
        if (cancelled || !project?.slug) return;
        const token = project.token ? `?token=${encodeURIComponent(project.token)}` : '';
        router.replace(`/${project.slug}${token}`);
      } catch {
        if (!cancelled) router.replace('/project?token=local-project');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Project
    </div>
  );
}

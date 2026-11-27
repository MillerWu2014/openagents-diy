'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api-base';
import { localProjectHref, readLocalProject } from '@/lib/local-project';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

/** Open the single local project. No landing page and no account picker. */
export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/v1/local/project`, { cache: 'no-store' });
        const project = readLocalProject(res.status, await res.json().catch(() => null));
        if (cancelled) return;
        if (!project) throw new Error('no local project');
        router.replace(localProjectHref(project));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [router, attempt]);

  if (!failed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t('workspaceGate.workspace')}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">{t('workspaceGate.loadFailedBody')}</p>
      <Button variant="outline" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

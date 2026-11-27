'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { desktopHost, type LocalAgentChoice } from '@/lib/desktop-host';
import { getApiBaseUrl } from '@/lib/api-base';
import { useT } from '@/lib/i18n';
import { localProjectHref, readLocalProject } from '@/lib/local-project';

/** The desktop host can pick a folder and bind agents. A browser only names the project. */
function fullHost() {
  const host = desktopHost();
  if (!host?.listLocalAgents || !host.pickDirectory || !host.createLocalProject) return null;
  return host;
}

/** Create a project: name, one folder, and the agents that work in it. */
export function NewLocalProject({ iconOnly }: { iconOnly?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState('');
  const [agents, setAgents] = useState<LocalAgentChoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const host = fullHost();

  useEffect(() => {
    if (!open || !host) return;
    let cancelled = false;
    void host.listLocalAgents!().then((list) => {
      if (!cancelled) setAgents(list || []);
    }).catch(() => { if (!cancelled) setAgents([]); });
    return () => { cancelled = true };
  }, [open, host]);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName('');
      setDirectory('');
      setSelected([]);
      setError('');
    }
  };

  const ready = !!name.trim() && (!host || (!!directory && selected.length > 0)) && !busy;

  const create = async () => {
    const trimmed = name.trim();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const project = host
        ? await host.createLocalProject!({ name: trimmed, directory, agents: selected })
        : await createByName(trimmed);
      close(false);
      router.push(localProjectHref(project));
    } catch {
      setError(t('dashboard.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size={iconOnly ? 'icon-xs' : 'xs'}
        aria-label={t('dashboard.newWorkspace')}
        onClick={() => setOpen(true)}
      >
        <Plus />
        {!iconOnly && t('dashboard.newWorkspace')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.createTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <Input
                aria-label={t('dashboard.namePlaceholder')}
                placeholder={t('dashboard.namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void create(); }}
              />
              {host && (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      aria-label={t('dashboard.folderLabel')}
                      placeholder={t('dashboard.folderPlaceholder')}
                      value={directory}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void host.pickDirectory!().then((dir) => { if (dir) setDirectory(dir); })}
                    >
                      {t('dashboard.folderBrowse')}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="m-0 text-sm text-muted-foreground">{t('dashboard.agentsLabel')}</p>
                    {agents.length === 0 ? (
                      <p className="m-0 text-sm text-muted-foreground">{t('dashboard.agentsEmpty')}</p>
                    ) : (
                      <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                        {agents.map((agent) => (
                          <label key={agent.name} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.includes(agent.name)}
                              onChange={() => setSelected((current) =>
                                current.includes(agent.name)
                                  ? current.filter((item) => item !== agent.name)
                                  : [...current, agent.name],
                              )}
                            />
                            {agent.displayName || agent.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button disabled={!ready} onClick={() => void create()}>
              {busy ? t('dashboard.createSlow') : t('dashboard.createWorkspace')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function createByName(name: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/local/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const project = readLocalProject(res.status, await res.json().catch(() => null));
  if (!project) throw new Error('create failed');
  return project;
}

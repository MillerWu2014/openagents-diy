'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { desktopHost } from '@/lib/desktop-host';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { listLocalProjects, localProjectHref, type LocalProject } from '@/lib/local-project';
import { NewLocalProject } from './new-local-project';

/** The last folder, with the shared prefix dropped. The full path stays on the title. */
export function projectFolderLabel(directory: string): string {
  const parts = directory.split(/[/\\]/).filter(Boolean);
  const leaf = parts[parts.length - 1];
  if (!leaf) return directory;
  return parts.length > 1 ? `…/${leaf}` : leaf;
}

/** The project name opens the list of projects on this computer. */
export function ProjectSwitcher({
  name,
  slug,
  iconOnly,
}: {
  name: string;
  slug?: string;
  iconOnly?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const current = projects?.find((project) => project.slug === slug);
  const currentFolder = current?.directory ? projectFolderLabel(current.directory) : '';

  useEffect(() => {
    let cancelled = false;
    void listLocalProjects()
      .then((rows) => { if (!cancelled) setProjects(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const mark = (
    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden">
      <Image src="/logo-black.png" alt="" width={20} height={20} className="size-full object-contain dark:hidden" />
      <Image src="/logo-white.png" alt="" width={20} height={20} className="hidden size-full object-contain dark:block" />
    </span>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={iconOnly
              ? 'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring'
              : 'flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'}
            aria-label={`${t('dashboard.switchProject')} ${name}`}
            title={current?.directory || name}
          >
            {iconOnly ? mark : (
              <>
                {mark}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  {currentFolder && (
                    <span className="block truncate text-xs text-muted-foreground" dir="rtl">
                      <span dir="ltr">{currentFolder}</span>
                    </span>
                  )}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={cn('max-h-80 overflow-auto', iconOnly ? 'w-64' : 'w-(--radix-dropdown-menu-trigger-width)')}>
          <DropdownMenuLabel>{t('dashboard.heading')}</DropdownMenuLabel>
          {failed && <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('dashboard.loadFailed')}</p>}
          {projects?.length === 0 && <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('dashboard.emptyTitle')}</p>}
          {projects?.map((project) => {
            const selected = project.slug === slug;
            const folder = project.directory ? projectFolderLabel(project.directory) : '';
            return (
              <DropdownMenuItem
                key={project.slug}
                data-current={selected ? 'true' : undefined}
                className={cn('flex-col items-start gap-0 py-1.5', selected && 'bg-accent text-accent-foreground')}
                onSelect={() => {
                  if (selected) return;
                  desktopHost()?.focusProject?.(project.slug);
                  router.push(localProjectHref(project));
                }}
              >
                <span className="w-full truncate font-medium">{project.name || project.slug}</span>
                {folder && (
                  <span className="w-full truncate text-xs text-muted-foreground" title={project.directory} dir="rtl">
                    <span dir="ltr">{folder}</span>
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus />
            {t('dashboard.newWorkspace')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewLocalProject open={creating} onOpenChange={setCreating} />
    </>
  );
}

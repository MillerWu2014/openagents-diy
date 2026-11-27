'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { desktopHost } from '@/lib/desktop-host';
import { useT } from '@/lib/i18n';
import { listLocalProjects, localProjectHref, type LocalProject } from '@/lib/local-project';

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

  useEffect(() => {
    let cancelled = false;
    void listLocalProjects()
      .then((rows) => { if (!cancelled) setProjects(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={iconOnly
            ? 'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'flex min-w-0 flex-1 items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'}
          aria-label={`${t('dashboard.switchProject')} ${name}`}
          title={name}
        >
          {iconOnly ? (
            <>
              <Image src="/logo-black.png" alt="" width={20} height={20} className="size-full object-contain dark:hidden" />
              <Image src="/logo-white.png" alt="" width={20} height={20} className="hidden size-full object-contain dark:block" />
            </>
          ) : (
            <>
              <span
                className="min-w-0 flex-1 truncate text-base font-semibold"
                onMouseEnter={(event) => {
                  const label = event.currentTarget;
                  if (label.scrollWidth > label.clientWidth) label.title = name;
                  else label.removeAttribute('title');
                }}
              >
                {name}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-64 overflow-auto">
        <DropdownMenuLabel>{t('dashboard.heading')}</DropdownMenuLabel>
        {failed && <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('dashboard.loadFailed')}</p>}
        {projects?.length === 0 && <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('dashboard.emptyTitle')}</p>}
        {projects?.map((project) => (
          <DropdownMenuCheckboxItem
            key={project.slug}
            checked={project.slug === slug}
            onSelect={() => {
              if (project.slug === slug) return;
              desktopHost()?.focusProject?.(project.slug);
              router.push(localProjectHref(project));
            }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{project.name || project.slug}</span>
              {project.directory && (
                <span className="truncate text-xs text-muted-foreground" title={project.directory}>{project.directory}</span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

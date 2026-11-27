'use client';
import * as React from 'react';
import { useT } from '@/lib/i18n';
import { EdgeToggle } from './edge-toggle';
import { RAIL_WIDTH_COLLAPSED, useLayout } from './layout-context';

const RAIL_KEYBOARD_SHORTCUT = 'b';

/**
 * The rail's collapse handle, on its trailing edge. It matches the list
 * panel's handle (bars that turn into a chevron, a dark label). The edge
 * itself drags the rail wider or narrower. Cmd/Ctrl+B toggles the rail too.
 *
 * `fixed` because the sidebar shell clips its overflow; it sits one pixel
 * past the rail, on the inset card's leading border.
 */
export function RailEdge() {
  const { isRailExpanded, railExpandedWidth, toggleRail, beginRailResize, resizeRail, endRailResize } = useLayout();
  const t = useT();
  const label = isRailExpanded ? t('nav.collapseSidebar') : t('nav.expandSidebar');
  const drag = React.useRef<{ x: number; width: number } | null>(null);
  const dragged = React.useRef(false);

  const toggleRef = React.useRef(toggleRail);
  toggleRef.current = toggleRail;

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== RAIL_KEYBOARD_SHORTCUT || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      // Capture phase on window runs before SidebarProvider's own listener, so
      // stopping here keeps the shortcut from also toggling the list panel.
      event.stopPropagation();
      toggleRef.current();
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  const edge = { left: 'calc(var(--sidebar-width-icon) + 1px)' };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragged.current = false;
    drag.current = { x: event.clientX, width: isRailExpanded ? railExpandedWidth : RAIL_WIDTH_COLLAPSED };
    beginRailResize();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const session = drag.current;
    if (!session) return;
    if (Math.abs(event.clientX - session.x) > 3) dragged.current = true;
    resizeRail(session.width + event.clientX - session.x);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    endRailResize();
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('nav.resizeSidebar')}
        aria-valuenow={isRailExpanded ? railExpandedWidth : RAIL_WIDTH_COLLAPSED}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={edge}
        className="fixed top-0 bottom-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize touch-none"
      />
      <EdgeToggle
        label={label}
        expanded={isRailExpanded}
        onClick={() => { if (dragged.current) dragged.current = false; else toggleRail(); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={edge}
        className="fixed top-1/2"
      />
    </>
  );
}

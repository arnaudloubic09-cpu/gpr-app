'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; children?: NavItem[] };
export type NavGroup = { title: string; items: NavItem[] };

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href.split('/').length > 3 && pathname.startsWith(`${href}/`));
  const link = (i: NavItem, sub = false) => (
    <Link
      key={i.href}
      href={i.href}
      className={[isActive(i.href) ? 'active' : '', sub ? 'sub' : ''].join(' ').trim()}
      aria-current={isActive(i.href) ? 'page' : undefined}
    >
      {i.label}
    </Link>
  );
  return (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {groups.map((g) => (
        <div key={g.title} className="nav-group">
          <div className="nav-title">{g.title}</div>
          {g.items.map((i) => {
            // Super admin : les pages d'un club s'affichent sous son nom quand on est dans cet espace
            const open = i.children && (pathname === i.href || pathname.startsWith(`${i.href}/`));
            return (
              <div key={i.href}>
                {link(i)}
                {open ? i.children!.map((c) => link(c, true)) : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

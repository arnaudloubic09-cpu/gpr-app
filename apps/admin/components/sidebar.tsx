'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; items: NavItem[] };

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href.split('/').length > 3 && pathname.startsWith(`${href}/`));
  return (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {groups.map((g) => (
        <div key={g.title} className="nav-group">
          <div className="nav-title">{g.title}</div>
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={isActive(i.href) ? 'active' : ''}
              aria-current={isActive(i.href) ? 'page' : undefined}
            >
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

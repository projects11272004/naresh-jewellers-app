import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  title: string;
  subtitle: string;
  statusText?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
}

export default function Header({
  title,
  subtitle,
  statusText,
  userEmail,
  userRole,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 bg-primary px-8 py-7 text-white">
      <div>
        <h1 className="m-0 text-[22px] tracking-wide">{title}</h1>
        <div className="mt-0.5 text-[13px] text-header-subtext">{subtitle}</div>
      </div>
      <div className="flex items-center gap-4 text-right text-[13px] text-header-subtext">
        <div>
          <div>{statusText ?? "Loading…"}</div>
          {userEmail && (
            <div className="mt-0.5">
              {userEmail}
              {userRole && (
                <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  {userRole}
                </span>
              )}
            </div>
          )}
        </div>
        <ThemeToggle />
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="rounded-md border border-white/30 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/10"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

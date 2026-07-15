interface HeaderProps {
  title: string;
  subtitle: string;
  statusText?: string;
}

export default function Header({ title, subtitle, statusText }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 bg-[#1F3864] px-8 py-7 text-white">
      <div>
        <h1 className="m-0 text-[22px] tracking-wide">{title}</h1>
        <div className="mt-0.5 text-[13px] text-[#C9D3E5]">{subtitle}</div>
      </div>
      <div className="text-right text-[13px] text-[#C9D3E5]">
        {statusText ?? "Loading…"}
      </div>
    </header>
  );
}

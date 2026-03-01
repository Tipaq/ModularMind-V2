export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 h-[calc(100vh)] overflow-hidden flex">{children}</div>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen justify-center bg-slate-50 px-5 pt-28 pb-16">
      {children}
    </main>
  );
}

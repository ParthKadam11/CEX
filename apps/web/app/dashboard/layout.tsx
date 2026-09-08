export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-dvh bg-background">
      <section className="mx-auto w-full max-w-[1600px] px-4 py-2 sm:px-6">
        {children}
      </section>
    </main>
  );
}

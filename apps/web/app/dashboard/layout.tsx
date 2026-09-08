export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-dvh bg-background">
      <section className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-6 sm:py-4">
        {children}
      </section>
    </main>
  );
}

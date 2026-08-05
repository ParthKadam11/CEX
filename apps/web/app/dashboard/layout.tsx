export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-bg-drift bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-bg.png')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-950/35 via-transparent to-emerald-950/55 backdrop-blur-md"
      />

      <section className="relative z-10 flex min-h-screen justify-center px-5 pt-24 pb-10 sm:px-8">
        {children}
      </section>
    </main>
  );
}

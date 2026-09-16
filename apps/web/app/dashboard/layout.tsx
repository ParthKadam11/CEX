export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-dvh bg-[#f4f7f5] dark:bg-background">
      <section className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 sm:py-5">
        {children}
      </section>
    </main>
  );
}

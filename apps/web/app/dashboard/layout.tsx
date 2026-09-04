export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <section className="mx-auto flex w-full max-w-6xl justify-center px-5 py-10 sm:px-8">
        {children}
      </section>
    </main>
  );
}

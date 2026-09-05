export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <section className="mx-auto flex w-full max-w-[1600px] justify-center px-3 py-4 sm:px-4">
        {children}
      </section>
    </main>
  );
}

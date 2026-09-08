import type { Metadata } from "next";
import { Instrument_Serif, Sora } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Appbar } from "@/components/Appbar";
import { authOptions } from "@/lib/auth";
import Provider from "./providers";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "CEX",
  description: "A clean spot exchange for SOL-USD.",
};

const themeInitScript = `
(() => {
  try {
    const key = "cex-theme";
    const stored = localStorage.getItem(key);
    const theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        <Provider session={session}>
          <Appbar>{children}</Appbar>
        </Provider>
      </body>
    </html>
  );
}

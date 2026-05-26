import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tap - Automated Attendance & WFH Timelog Engine",
  description: "A secure, set-it-and-forget-it automated work attendance and WFH logging manager, integrated with Supabase and Playwright.",
  authors: [{ name: "Antigravity Team" }],
  keywords: ["Playwright", "Supabase", "Attendance", "Timelog", "WFH", "Automation"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* Premium layered decor background (replicating reference UI) */}
        <div className="decor-bg" aria-hidden="true">
          <div className="decor-circle-main"></div>
          <div className="decor-circle-top-left"></div>
          <div className="decor-circle-bottom-right"></div>
        </div>
        
        {/* Main application wrapper */}
        <div className="min-h-screen flex flex-col relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}


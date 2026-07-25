import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobScan — point your CV at the internet",
  description: "Upload a CV, add keywords, scan Philippine job boards, get scored matches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          // Apply the saved theme before paint to avoid a flash.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}

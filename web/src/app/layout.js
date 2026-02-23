import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata = {
  title: "Watchio | Watch Party",
  description: "Sync Videos with friends — in classic cinema style!",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        {/* CRT scanline overlay */}
        <div className="crt-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}

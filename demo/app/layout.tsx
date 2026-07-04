import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Mosaic - AI thoughts, made visible',
  description:
    'Live Mosaic showcases: hand-written .mosaic artifacts rendered natively by @mosaicjs/react through the site component set.',
};

const themeInitScript =
  "try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}

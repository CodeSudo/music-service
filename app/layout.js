import "./globals.css";

export const metadata = {
  title: "Stable Stream Pro",
  description: "Search and stream music with a YouTube Music style queue experience.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

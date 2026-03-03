export default function StudyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="app-shell flex h-screen w-screen overflow-hidden bg-gradient-to-b from-background via-background to-muted/40 text-foreground"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {children}
    </div>
  );
}

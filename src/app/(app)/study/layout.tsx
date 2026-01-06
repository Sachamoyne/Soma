export default function StudyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {children}
    </div>
  );
}

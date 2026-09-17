export default function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-hug-background" aria-busy="true">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-hug-border border-t-hug-primary" />
        <p className="text-sm font-semibold text-hug-muted">Restoring your HUGPONG session…</p>
      </div>
    </main>
  );
}


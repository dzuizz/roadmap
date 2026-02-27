import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-lg font-semibold">Ada Roadmap</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24">
        <div className="mx-auto max-w-2xl text-center space-y-6">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Build your own roadmaps
          </h1>
          <p className="text-lg text-muted-foreground">
            Create, evolve, and track tree-based roadmaps for any learning path,
            project plan, or skill progression. Your roadmaps, your way.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start Building
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="mx-auto mt-20 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div className="space-y-2">
            <h3 className="font-medium">Tree-based structure</h3>
            <p className="text-sm text-muted-foreground">
              Organize knowledge hierarchically. Add nodes, nest subtrees, and
              build roadmaps that mirror how you think.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Track progress</h3>
            <p className="text-sm text-muted-foreground">
              Mark nodes as complete and see aggregate progress. Know exactly
              where you stand on any learning path.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Safe editing</h3>
            <p className="text-sm text-muted-foreground">
              Subtree deletion warnings, a 30-day trash bin, and auto-save
              ensure you never lose important work.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-muted-foreground">
          Ada Roadmap
        </div>
      </footer>
    </div>
  );
}

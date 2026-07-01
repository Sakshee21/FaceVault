export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">FaceVault</h1>
            <p className="text-xs text-gray-400">Decentralized face consent registry</p>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">{children}</main>
      <footer className="text-center text-xs text-gray-600 py-8">
        FaceVault · IEEE Research Project · Sakshee, VIT Chennai
      </footer>
    </div>
  );
}

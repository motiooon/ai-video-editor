import { useEffect } from 'react';
import { useReviewStore } from './store.js';
import { Layout } from './components/layout/index.js';

export default function App() {
  const status = useReviewStore((s) => s.status);
  const errorMessage = useReviewStore((s) => s.errorMessage);
  const load = useReviewStore((s) => s.load);
  const undo = useReviewStore((s) => s.undo);
  const stopPreview = useReviewStore((s) => s.stopPreview);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        stopPreview();
        return;
      }
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, stopPreview]);

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500" />
          <p className="text-sm text-neutral-500">Loading review…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950">
        <div className="max-w-md rounded-xl border border-red-900/50 bg-red-950/30 p-8 text-center">
          <p className="mb-2 text-lg font-semibold text-red-400">Failed to load review</p>
          <p className="text-sm text-red-300/70">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return <Layout />;
}

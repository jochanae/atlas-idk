import LinkManager from '../components/LinkManager';

export default function LinksPage() {
  return (
    <div className="px-4 pt-5 pb-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-white tracking-tight">Links</h1>
        <p className="text-xs text-white/40 mt-0.5">Manage your active social channels</p>
      </div>
      <LinkManager />
    </div>
  );
}
import { Link } from 'react-router-dom';

export default function AtelierEmineCampaign() {
  return <aside aria-label="Atelier Emine designer spotlight" className="w-full border-b border-border bg-card text-foreground">
    <Link to="/atelier-emine" aria-label="Explore Atelier Emine’s collection preview" className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]">
      <img src="/atelier-emine-campaign-v1.webp" width="1143" height="569" alt="Atelier Emine campaign featuring a model holding a pink mother-of-pearl handbag" fetchPriority="high" className="block h-auto w-full object-contain"/>
    </Link>
    <div className="flex flex-col items-start justify-between gap-x-6 px-5 py-4 text-[13px] leading-6 sm:flex-row sm:flex-wrap sm:items-center sm:px-10">
      <span>Designer spotlight / Atelier Emine</span>
      <Link to="/atelier-emine" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Explore the collection →</Link>
      <span className="text-xs sm:text-[13px]">Purchasing coming soon</span>
    </div>
  </aside>;
}

import { Link } from 'react-router-dom';

export default function AtelierEmineCampaign() {
  return <figure className="hob-editorial-image">
    <Link to="/atelier-emine" aria-label="Explore Atelier Emine’s collection preview">
      <img src="/atelier-emine-campaign-v1.webp" width="1143" height="569" alt="Atelier Emine campaign featuring a model holding a pink mother-of-pearl handbag" fetchPriority="high"/>
    </Link>
    <figcaption>
      <span>01 / Designer spotlight</span>
      <Link to="/atelier-emine">Atelier Emine <span aria-hidden="true">↗</span></Link>
    </figcaption>
  </figure>;
}

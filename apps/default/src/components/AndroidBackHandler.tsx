import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Handles Android hardware/predictive Back without changing browser navigation. */
export default function AndroidBackHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    let cleanup = () => {};
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('backButton', ({ canGoBack }) => {
        if (window.history.state?.idx > 0 || canGoBack) navigate(-1);
        else navigate('/');
      });
      if (active) cleanup = () => { void listener.remove(); };
      else void listener.remove();
    })().catch(error => console.error('Android Back integration unavailable', error));
    return () => { active = false; cleanup(); };
  }, [navigate]);
  return null;
}

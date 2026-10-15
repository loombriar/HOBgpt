import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// This entry is loaded only by the legacy document. React has its own listener.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  void App.addListener('backButton', ({ canGoBack }) => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) {
      dialog.close();
      return;
    }
    if (canGoBack) window.history.back();
    // Remain at the storefront on a cold launch instead of exiting the app.
  }).catch(error => console.error('Android Back integration unavailable', error));
}

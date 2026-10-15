import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(), getPlatform: vi.fn(), addListener: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: native }));
vi.mock('@capacitor/app', () => ({ App: native }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); vi.resetModules(); });

it('does not intercept Back in an ordinary browser', async () => {
  native.isNativePlatform.mockReturnValue(false);
  await import('./legacy-android-back');
  expect(native.addListener).not.toHaveBeenCalled();
});

it('handles Android root launch, navigation history and open dialogs', async () => {
  native.isNativePlatform.mockReturnValue(true);
  native.getPlatform.mockReturnValue('android');
  native.addListener.mockResolvedValue({ remove: vi.fn() });
  const back = vi.fn(), close = vi.fn(), querySelector = vi.fn().mockReturnValue(null);
  vi.stubGlobal('window', { history: { back } });
  vi.stubGlobal('document', { querySelector });
  await import('./legacy-android-back');
  expect(native.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  const handler = native.addListener.mock.calls[0][1];
  handler({ canGoBack: false });
  expect(back).not.toHaveBeenCalled();
  handler({ canGoBack: true });
  expect(back).toHaveBeenCalledTimes(1);
  querySelector.mockReturnValue({ close });
  handler({ canGoBack: true });
  expect(close).toHaveBeenCalledOnce();
  expect(back).toHaveBeenCalledTimes(1);
});

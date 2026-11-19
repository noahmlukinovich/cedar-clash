/**
 * "Install" the game to the home screen. Android and desktop Chrome offer a
 * prompt (beforeinstallprompt) that we hold until the player asks for it in
 * Settings; iPhones have no prompt, so we show how to do it from Safari.
 */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;

export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no mini-infobar; Settings has the button
    deferred = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => (deferred = null));
}

/** Already running from the home screen? */
export function isInstalled(): boolean {
  try {
    if (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return true;
  } catch {
    // old browser
  }
  return (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** What Settings can offer: the browser's prompt, iPhone instructions, or nothing. */
export function installOption(): 'prompt' | 'ios' | null {
  if (isInstalled()) return null;
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : null;
}

export async function promptInstall(): Promise<boolean> {
  const d = deferred;
  if (!d) return false;
  deferred = null; // each prompt can only be used once
  await d.prompt();
  return (await d.userChoice).outcome === 'accepted';
}

import { systemPreferences, shell, BrowserWindow, ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './logger';

const execFileAsync = promisify(execFile);
const log = createLogger('Accessibility');

export function checkAccessibilityPermission(): boolean {
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  log.info('Accessibility API check', { isTrusted });
  return isTrusted;
}

/**
 * Test if we can actually send keystrokes via System Events.
 * This is the real test - reading works with basic permission,
 * but sending keystrokes requires full accessibility access.
 */
export async function testAccessibilityPermission(): Promise<boolean> {
  try {
    // Try to send an empty keystroke - this tests actual keystroke permission
    // without typing anything visible
    const script = `tell application "System Events" to keystroke ""`;
    await execFileAsync('/usr/bin/osascript', ['-e', script]);
    log.info('Accessibility keystroke test passed');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Error 1002 means "not allowed to send keystrokes"
    if (errorMessage.includes('1002') || errorMessage.includes('not allowed')) {
      log.info('Accessibility keystroke test failed - no permission', { error: errorMessage });
    } else {
      log.info('Accessibility keystroke test failed', { error: errorMessage });
    }
    return false;
  }
}

export async function openAccessibilitySettings(): Promise<void> {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  );
}

export function setupAccessibilityHandlers(window: BrowserWindow) {
  ipcMain.handle('check-accessibility-permission', async () => {
    // Use the actual test, not the unreliable API
    return testAccessibilityPermission();
  });

  ipcMain.handle('open-accessibility-settings', async () => {
    await openAccessibilitySettings();
  });

  // Re-check permission when app regains focus
  window.on('focus', async () => {
    const granted = await testAccessibilityPermission();
    window.webContents.send('accessibility-permission-changed', granted);
  });
}

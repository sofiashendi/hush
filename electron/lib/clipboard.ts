import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { createLogger } from './logger';

const log = createLogger('Clipboard');

// Store reference to main window for focus checks
let mainWindow: BrowserWindow | null = null;

/**
 * Initialize clipboard IPC handlers
 * Must be called after window creation
 */
export function setupClipboardHandlers(window: BrowserWindow) {
  mainWindow = window;
}

// Type placeholder ("...")
ipcMain.handle('type-placeholder', async () => {
  // We simply type three periods. Typing is safer than pasting for this tiny string
  // as it doesn't overwrite the clipboard.
  const script = `tell application "System Events" to keystroke "..."`;

  execFile('/usr/bin/osascript', ['-e', script], (err, stdout, stderr) => {
    if (err) log.error('Placeholder error', { error: err.message, stderr });
  });
});

// Remove placeholder (3 backspaces)
ipcMain.handle('remove-placeholder', async () => {
  // key code 51 is DELETE (Backspace)
  const script = `tell application "System Events"
        repeat 3 times
            key code 51
        end repeat
    end tell`;

  execFile('/usr/bin/osascript', ['-e', script], (err, stdout, stderr) => {
    if (err) log.error('Remove placeholder error', { error: err.message, stderr });
  });
});

// Smart paste with role detection
ipcMain.handle('paste-text', async (event, text, autoPaste = false) => {
  log.info('Copying text to clipboard', { text });
  clipboard.writeText(text);

  if (autoPaste) {
    log.info('Auto-paste enabled', {
      hasWindow: !!mainWindow,
      isFocused: mainWindow?.isFocused(),
    });

    if (!mainWindow || !mainWindow.isFocused()) {
      // User is focused elsewhere (Word, Notes, Antigravity, etc.).
      // Proceed to Smart Role Check.

      const checkEditableScript = `tell application "System Events"
                set frontApp to name of first application process whose frontmost is true
                try
                    tell process frontApp
                        set focusedElement to value of attribute "AXFocusedUIElement"
                        set elRole to value of attribute "AXRole" of focusedElement
                        return elRole
                    end tell
                on error
                    return "Unknown"
                end try
            end tell`;

      execFile(
        '/usr/bin/osascript',
        ['-e', checkEditableScript],
        (checkErr, checkStdout, checkStderr) => {
          if (checkErr) {
            log.error('Smart Paste: Role check failed', {
              error: checkErr.message,
              stderr: checkStderr,
            });
            // Try to paste anyway since we can't determine the role
            const script = `tell application "System Events" to keystroke "v" using command down`;
            execFile('/usr/bin/osascript', ['-e', script], (error, stdout, stderr) => {
              if (error) {
                log.error('Auto-paste exec error', { error: error.message, stderr });
              } else {
                log.info('Smart Paste: Pasted (role check failed, attempted anyway)');
              }
            });
            return;
          }

          const role = checkStdout?.trim();
          log.info('Smart Paste: Focused Role', { role });

          const editableRoles = [
            'AXTextField',
            'AXTextArea',
            'AXWebArea',
            'AXRichTextView',
            'AXgroup',
          ];
          // Not Pasting fix for unknowns:
          const extendedRoles = [...editableRoles, 'Unknown'];

          if (extendedRoles.includes(role)) {
            log.info('Smart Paste: Pasting', { role });
            // We DO NOT need to hide window here because we are NOT focused (mainWindow.isFocused() check passed).
            // So we can just paste immediately!

            const script = `tell application "System Events" to keystroke "v" using command down`;
            execFile('/usr/bin/osascript', ['-e', script], (error, stdout, stderr) => {
              if (error) {
                log.error('Auto-paste exec error', { error: error.message, stderr });
              } else {
                log.info('Smart Paste: Paste command completed');
              }
            });
          } else {
            log.info('Smart Paste: Skipped pasting. Text is in clipboard', { role });
          }
        }
      );
    } else {
      // Hush IS focused.
      // Correct Behavior: Just Copy to Clipboard. Stay Visible.
      log.info('Smart Paste: Hush is focused. Copied to Clipboard. NOT Pasting/Hiding');
    }
  }
});

// Hide window handler
ipcMain.handle('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

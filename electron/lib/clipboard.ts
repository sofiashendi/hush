import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { exec } from 'child_process';

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

    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error('Placeholder error:', err);
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

    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error('Remove placeholder error:', err);
    });
});

// Smart paste with role detection
ipcMain.handle('paste-text', async (event, text, autoPaste = false, deleteCount = 0) => {
    console.log('Copying text to clipboard:', text);
    clipboard.writeText(text);

    if (autoPaste) {

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

            exec(`osascript -e '${checkEditableScript}'`, (checkErr, checkStdout) => {
                const role = checkStdout?.trim();
                console.log(`[Smart Paste] Focused Role: ${role}`);

                const editableRoles = ['AXTextField', 'AXTextArea', 'AXWebArea', 'AXRichTextView', 'AXgroup'];
                // Not Pasting fix for unknowns:
                const extendedRoles = [...editableRoles, 'Unknown'];

                if (extendedRoles.includes(role)) {
                    console.log(`[Smart Paste] Pasting into ${role}...`);
                    // We DO NOT need to hide window here because we are NOT focused (mainWindow.isFocused() check passed).
                    // So we can just paste immediately!

                    const script = `tell application "System Events" to keystroke "v" using command down`;
                    exec(`osascript -e '${script}'`, (error) => {
                        if (error) console.error('Auto-paste exec error:', error);
                    });
                } else {
                    console.log(`[Smart Paste] Skipped pasting for role: ${role}. Text is in clipboard.`);
                }
            });

        } else {
            // Hush IS focused.
            // Correct Behavior: Just Copy to Clipboard. Stay Visible.
            console.log('[Smart Paste] Hush is focused. Copied to Clipboard. NOT Pasting/Hiding.');
        }
    }
});

// Hide window handler
ipcMain.handle('hide-window', () => {
    if (mainWindow) mainWindow.hide();
});

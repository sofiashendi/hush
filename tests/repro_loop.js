
// Real console for output
const realConsole = console;

let logs = [];
const fakeConsole = { log: (msg) => logs.push(msg) };

// Variables from App.tsx
let isFlushing = false;
let isVadTriggered = false;

const mediaRecorder = {
    state: 'recording',
    stop: () => {
        fakeConsole.log("MediaRecorder.stop() called");
        // In browser, this is async to fire onstop
        setTimeout(() => {
            onstop();
        }, 10); // increased delay to simulate async nature
    },
    start: () => {
        fakeConsole.log("Recorder restarted.");
    }
};

const onstop = () => {
    // Logic from App.tsx onstop
    if (isVadTriggered) {
        fakeConsole.log('Restarting Recorder immediately...');
        isVadTriggered = false;

        // BUG: In current App.tsx, isFlushing is NOT reset here!
        // isFlushing = false; // Missing line

        mediaRecorder.start();
    }
};

const flushSegment = () => {
    if (isFlushing) {
        fakeConsole.log("Skipped flush (Locked)");
        return;
    }

    fakeConsole.log('Flushing Segment (Restarting Recorder)...');

    isFlushing = true; // LOCK
    isVadTriggered = true;

    if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    } else {
        isFlushing = false;
    }
};

// Simulate VAD Loop
async function runVadLoop() {
    // Run 5 iterations quickly (simulating RAF)
    for (let i = 0; i < 5; i++) {
        flushSegment();
        await new Promise(r => setTimeout(r, 5)); // 5ms gap
    }

    // Wait for async stop to process
    await new Promise(r => setTimeout(r, 100));

    // Try flushing again (next sentence)
    fakeConsole.log("--- Second Sentence ---");
    flushSegment();

    // Report
    realConsole.log(JSON.stringify(logs, null, 2));
}

runVadLoop();

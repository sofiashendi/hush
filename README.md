# Hush

A sleek, native-feeling macOS application that captures speech, converts it to text using a **Cloudflare Worker (Whisper AI)**, and copies it to your clipboard for instant pasting.

Created by Sofia Shendi
https://sofiashendi.com

<img width="1394" height="881" alt="Idle State" src="https://github.com/user-attachments/assets/d5104a6c-92b7-4b79-b956-d50b6d22fa57" />

<img width="1410" height="1134" alt="Recording State" src="https://github.com/user-attachments/assets/cb2a4cd0-a1ad-492b-9e6b-49171901a404" />

<img width="1398" height="977" alt="Settings" src="https://github.com/user-attachments/assets/b12cbbec-7ea8-48f8-b4f2-89eef91ca2c0" />

## Features
- **Global Shortcut**: Press `Cmd + '` (Single Quote) to toggle the recorder from anywhere.
- **Native UI**: Draggable, transparent, and non-intrusive design.
- **Cloud Powered**: Uses Cloudflare Workers AI (@cf/openai/whisper) for fast, accurate transcription without local Docker containers.
- **Continuous Flow**: Speak, pause, and watch it paste. The mic stays open so you can keep dictating.
- **Auto-Paste**: Automatically types your text into the active window (requires Accessibility permission).
- **Secure**: Your API Key is stored encrypted in your local machine.

## 💰 Costs & Limits (Cloudflare)

This application uses **Cloudflare Workers AI**, which has a generous free tier but is not unlimited.

*   **Free Pricing:** You get **10,000 Neurons per day** for free on the Workers Free plan. This is typically sufficient for personal daily usage (dictating emails, messages, short docs).
*   **Overages:** If you exceed the free limit (or use the Paid plan), costs are approximately:
    *   **Speech-to-Text (Whisper-large-v3-turbo):** ~$0.0005 per minute of audio.
    *   *Note: These prices are estimates and subject to Cloudflare's official pricing.*

If you use the app heavily (hours per day), you may need to upgrade to the Cloudflare Workers Paid plan ($5/mo minimum).

## Prerequisites
- **Node.js**: v18+ installed.
- **Cloudflare Account**: To deploy the worker.
- **Permissions**: The app needs **Microphone** access to hear you, and **Accessibility** access to Auto-Paste text.

## Backend Setup (Cloudflare Worker)

This app requires a Cloudflare Worker to handle audio transcription using the `@cf/openai/whisper` model.

1.  **Create a Worker via Dashboard**:
    -   Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
    -   Go to **Workers & Pages** > **Create Application** > **Create Worker**.
    -   Name it (e.g., `hush-backend`) and click **Deploy**.

2.  **Add the Code**:
    -   Click **Edit Code**.
    -   Paste the following into `worker.js`. This code handles authentication and calls the Whisper AI model.

    ```javascript
    // Whisper prompt - provides context to help with transcription accuracy
    const WHISPER_PROMPT = "Natural conversational dictation. The speaker is thinking aloud, drafting notes, code comments, or composing messages. Proper nouns may include tech terms.";

    export default {
      async fetch(request, env) {
        // CORS Headers
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        // Handle Preflight
        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

        // Authentication
        const apiKey = request.headers.get("Authorization");
        if (!env.WORKER_API_KEY || apiKey !== env.WORKER_API_KEY) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        try {
          const audioBuffer = await request.arrayBuffer();

          // Validate minimum audio size (~50KB = ~2 seconds of audio)
          // Whisper needs enough audio context to process
          const MIN_AUDIO_SIZE = 50000;
          if (audioBuffer.byteLength < MIN_AUDIO_SIZE) {
            return Response.json({ text: "" }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Convert to Base64 (required for whisper-large-v3-turbo)
          const uint8Array = new Uint8Array(audioBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Audio = btoa(binary);

          // Run Whisper Model using Workers AI
          const response = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
            audio: base64Audio,
            vad_filter: true,
            initial_prompt: WHISPER_PROMPT,
          });

          let transcription = response.text || "";

          // Minimal hallucination filtering (whisper-large-v3-turbo is already very good)
          // Only filter ENTIRE transcriptions that are clearly not real speech
          const HALLUCINATION_PATTERNS = [
            /^\s*\.+\s*$/,  // Just dots/periods
            /^[\u3000-\u9FAF\uFF00-\uFFEF\s]+$/,  // Pure CJK characters (when user speaks English)
          ];

          if (transcription && HALLUCINATION_PATTERNS.some(p => p.test(transcription.trim()))) {
            transcription = "";
          }

          return Response.json({ text: transcription }, { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }
      },
    };
    ```

3.  **Configure Bindings & Secrets**:
    -   Go to **Settings** > **Bindings**.
    -   Add a **Workers AI** binding. Variable name: `AI`.
    -   Go to **Settings** > **Variables and Secrets**.
    -   Add a Secret variable named `WORKER_API_KEY` with a strong password.

4.  **Deploy & Copy URL**:
    -   Click **Deploy**.
    -   Copy the worker URL (e.g., `https://hush-backend.yourname.workers.dev`).

## Application Configuration

Before you start, you need to link the app to your backend:

1.  Launch **Hush**.
2.  Click the **Gear Icon** in the top right corner.
3.  **API URL**: Paste your Cloudflare Worker URL.
4.  **API Key**: Enter the secret password you chose (`WORKER_API_KEY`).
5.  **Auto-Paste**: Toggle this **ON** for the best experience.
6.  Click **Save**.

*Note: Credentials are stored securely using OS-level encryption.*

## Build & Install

Since this app is not notarized by Apple, you must build it yourself for local usage:

1.  **Clone the repo**
    ```bash
    git clone https://github.com/sofiashendi/hush.git
    cd hush
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Build the App**
    ```bash
    npm run dist
    ```
    The `.dmg` installer will be in the `dist/` folder.

4.  **Install & Open**
    -   Open the `.dmg` and drag the app to Applications.
    -   **First launch:** Right-click → Open → Click "Open" in the dialog.
    -   Grant **Microphone** and **Accessibility** permissions when prompted.

## Development

To run in development mode with hot reload:

```bash
npm run dev
```

*Note: If "Auto-Paste" fails, go to **System Settings > Privacy & Security > Accessibility** and ensure Hush is allowed.*

## Usage (Continuous Mode)
1.  **Focus**: Click on the text field where you want to type (e.g., Notion, Words, VS Code).
2.  **Toggle**: Press `Cmd + '`.
3.  **Speak**: Say your sentence clearly.
4.  **Pause**: Stop speaking for ~1.5 seconds.
5.  **Watch**: The app will automatically transcribe and paste your text.
6.  **Repeat**: Keep speaking the next sentence.
7.  **Stop**: Press `Cmd + '` again when done.

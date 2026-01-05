# Speech-to-Text OS App

A sleek, native-feeling macOS application that captures speech, converts it to text using a **Cloudflare Worker (Whisper AI)**, and copies it to your clipboard for instant pasting.

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
    export default {
      async fetch(request, env) {
        // 1. CORS Headers
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        // Handle Preflight
        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        // 2. Authentication
        const apiKey = request.headers.get("Authorization");
        if (!apiKey || apiKey !== env.WORKER_API_KEY) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        // 3. Process Audio
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

        try {
          const audioBuffer = await request.arrayBuffer();
          
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
            initial_prompt: "Natural conversational dictation.",
          });

          return new Response(JSON.stringify({ text: response.text || "" }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
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

## Download & Install

1.  **Download**: Go to the [Releases](../../releases) page and download the latest `.dmg` file.
2.  **Install**: Open the `.dmg` and drag the app to your Applications folder.
3.  **Open (Important)**:
    -   Because this app is not notarized by Apple, you will see a security warning ("Unidentified Developer").
    -   **Right-click** (or Control-click) the app in Finder.
    -   Select **Open**.
    -   Click **Open** in the dialog box.
    -   You only need to do this once.

## Development Setup

If you prefer to build from source or contribute:

1.  **Clone the repo**
    ```bash
    git clone https://github.com/sofiashendi/hush.git
    cd hush
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run in Development**
    ```bash
    npm run dev
    ```

    *Note: If "Auto-Paste" fails, go to **System Settings > Privacy & Security > Accessibility** and ensure your Terminal (if in dev) or "Hush" (if installed) is allowed.*



## Production Build
To create a standalone macOS app (`.dmg`):

```bash
npm run dist
```
The installer will be in the `dist/` folder.

## Usage (Continuous Mode)
1.  **Focus**: Click on the text field where you want to type (e.g., Notion, Words, VS Code).
2.  **Toggle**: Press `Cmd + '`.
3.  **Speak**: Say your sentence clearly.
4.  **Pause**: Stop speaking for ~1.5 seconds.
5.  **Watch**: The app will automatically transcribe and paste your text.
6.  **Repeat**: Keep speaking the next sentence.
7.  **Stop**: Press `Cmd + '` again when done.

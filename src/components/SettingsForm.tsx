import React from 'react';

interface SettingsFormProps {
    apiUrl: string;
    apiKey: string;
    autoPaste: boolean;
    aiPolish: boolean;
    onApiUrlChange: (val: string) => void;
    onApiKeyChange: (val: string) => void;
    onAutoPasteChange: (val: boolean) => void;
    onAiPolishChange: (val: boolean) => void;
    onSave: () => void;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
    apiUrl,
    apiKey,
    autoPaste,
    aiPolish,
    onApiUrlChange,
    onApiKeyChange,
    onAutoPasteChange,
    onAiPolishChange,
    onSave
}) => {
    return (
        <div className="settings-form">
            <div className="input-group">
                <label>Worker URL</label>
                <input
                    type="text"
                    placeholder="https://your-worker.workers.dev"
                    value={apiUrl}
                    onChange={(e) => onApiUrlChange(e.target.value)}
                />
            </div>
            <div className="input-group">
                <label>Worker API Key</label>
                <input
                    type="password"
                    placeholder="Secret Key"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                />
            </div>
            <div className="toggle-group">
                <label>Auto-paste text</label>
                <label className="switch">
                    <input
                        type="checkbox"
                        checked={autoPaste}
                        onChange={(e) => onAutoPasteChange(e.target.checked)}
                    />
                    <span className="slider"></span>
                </label>
            </div>

            <div className="toggle-group" style={{ marginTop: '10px' }}>
                <label>
                    ✨ AI Polish
                    <span style={{ fontSize: '10px', display: 'block', color: '#666' }}>Remove ums, fix punctuation (Llama 3)</span>
                </label>
                <label className="switch">
                    <input
                        type="checkbox"
                        checked={aiPolish}
                        onChange={(e) => onAiPolishChange(e.target.checked)}
                    />
                    <span className="slider"></span>
                </label>
            </div>
            <div className="actions">
                <button className="btn btn-save" onClick={onSave}>Save</button>
            </div>
        </div>
    );
};

export default SettingsForm;

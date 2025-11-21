import React, { useState, useEffect } from 'react';

interface ConnectionFormProps {
  onConnect: (serverUrl: string, playerId: string, mode: 'watch' | 'polling') => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ onConnect }) => {
  const [serverUrl, setServerUrl] = useState('localhost:8080');
  const [playerId, setPlayerId] = useState('');
  const [mode, setMode] = useState<'watch' | 'polling'>('polling');

  // Auto-generate player ID on component mount
  useEffect(() => {
    const generatePlayerId = () => {
      const timestamp = Date.now().toString(36);
      const randomStr = Math.random().toString(36).substring(2, 7);
      return `player_${timestamp}${randomStr}`;
    };
    setPlayerId(generatePlayerId());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(serverUrl, playerId, mode);
  };

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="serverUrl">Server URL:</label>
        <input
          id="serverUrl"
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="localhost:8080"
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="playerId">Player ID (Auto-generated):</label>
        <div className="player-id-display">
          <input
            id="playerId"
            type="text"
            value={playerId}
            readOnly
            className="player-id-input"
          />
          <button
            type="button"
            className="button-regenerate"
            onClick={() => {
              const timestamp = Date.now().toString(36);
              const randomStr = Math.random().toString(36).substring(2, 7);
              setPlayerId(`player_${timestamp}${randomStr}`);
            }}
            title="Generate new Player ID"
          >
            🔄
          </button>
        </div>
      </div>
      
      <div className="form-group">
        <label htmlFor="mode">Update Mode:</label>
        <div className="mode-selection">
          <label className="mode-option">
            <input
              type="radio"
              name="mode"
              value="polling"
              checked={mode === 'polling'}
              onChange={(e) => setMode(e.target.value as 'watch' | 'polling')}
            />
            <span className="mode-label">
              <strong>Polling</strong>
              <small>Refresh board every 2 seconds automatically</small>
            </span>
          </label>
          <label className="mode-option">
            <input
              type="radio"
              name="mode"
              value="watch"
              checked={mode === 'watch'}
              onChange={(e) => setMode(e.target.value as 'watch' | 'polling')}
            />
            <span className="mode-label">
              <strong>Watch</strong>
              <small>Get notified immediately when board changes</small>
            </span>
          </label>
        </div>
      </div>
      
      <button type="submit" className="button">
        Connect to Game
      </button>
    </form>
  );
};

export default ConnectionForm;
import React, { useState } from 'react';

interface ConnectionFormProps {
  onConnect: (serverUrl: string, playerId: string) => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ onConnect }) => {
  const [serverUrl, setServerUrl] = useState('localhost:8080');
  const [playerId, setPlayerId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(serverUrl, playerId);
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
        <label htmlFor="playerId">Player ID:</label>
        <input
          id="playerId"
          type="text"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="Enter your player name"
          pattern="[a-zA-Z0-9_]+"
          title="Only letters, numbers, and underscores allowed"
          required
        />
      </div>
      
      <button type="submit" className="button">
        Connect to Game
      </button>
    </form>
  );
};

export default ConnectionForm;
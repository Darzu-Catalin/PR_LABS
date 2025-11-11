import React from 'react';

interface PlayerInfoProps {
  playerId: string;
  serverUrl: string;
  onDisconnect: () => void;
  onRefresh: () => void;
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({ 
  playerId, 
  serverUrl, 
  onDisconnect, 
  onRefresh 
}) => {
  return (
    <div className="player-info">
      <div className="player-id">
        Playing as: <strong>{playerId}</strong> on {serverUrl}
      </div>
      <div className="controls">
        <button onClick={onRefresh} className="button">
          Refresh Board
        </button>
      </div>
    </div>
  );
};

export default PlayerInfo;
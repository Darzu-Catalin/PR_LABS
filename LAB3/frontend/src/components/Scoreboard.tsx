import React from 'react';

export interface PlayerScore {
  playerId: string;
  matches: number;
  totalCards: number;
}

interface ScoreboardProps {
  scores: PlayerScore[];
  currentPlayerId: string;
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores, currentPlayerId }) => {
  if (scores.length === 0) {
    return (
      <div className="scoreboard">
        <h3 className="scoreboard-title">🏆 Player Scores</h3>
        <div className="score-empty">
          <p>🎮 Start playing to see scores!</p>
          <p>Make matches to earn points and appear on the leaderboard.</p>
        </div>
      </div>
    );
  }

  // Sort scores by matches (descending)
  const sortedScores = [...scores].sort((a, b) => b.matches - a.matches);

  return (
    <div className="scoreboard">
      <h3 className="scoreboard-title">🏆 Player Scores</h3>
      <div className="score-list">
        {sortedScores.map((score, index) => {
          const isCurrentPlayer = score.playerId === currentPlayerId;
          const isLeader = index === 0 && score.matches > 0;
          
          return (
            <div 
              key={score.playerId} 
              className={`score-item ${isCurrentPlayer ? 'current-player' : ''} ${isLeader ? 'leader' : ''}`}
            >
              <div className="score-player">
                <span className="player-name">
                  {isCurrentPlayer ? '👤 ' : ''}{score.playerId}
                  {isLeader ? ' 👑' : ''}
                </span>
                <span className="player-rank">#{index + 1}</span>
              </div>
              <div className="score-stats">
                <div className="matches">
                  <span className="matches-count">{score.matches}</span>
                  <span className="matches-label">matches</span>
                </div>
                <div className="progress">
                  <span className="cards-found">{score.matches * 2}</span>
                  <span className="cards-total">/ {score.totalCards}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Scoreboard;
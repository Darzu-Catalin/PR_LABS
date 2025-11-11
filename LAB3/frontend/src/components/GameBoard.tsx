import React from 'react';
import { CardState } from '../utils/boardParser';

interface GameBoardProps {
  board: CardState[][];
  dimensions: { height: number; width: number };
  onCardClick: (row: number, col: number) => void;
  currentPlayerId: string;
}

const GameBoard: React.FC<GameBoardProps> = ({ board, dimensions, onCardClick, currentPlayerId }) => {
  // Array of player colors for different players
  const playerColors = ['player-1', 'player-2', 'player-3', 'player-4'];
  const playerList = ['alice', 'bob', 'charlie', 'david', 'eve', 'frank', 'grace', 'henry'];

  const getPlayerColorClass = (playerId: string): string => {
    const index = playerList.findIndex(p => p.toLowerCase() === playerId.toLowerCase());
    if (index >= 0 && index < playerColors.length) {
      return playerColors[index];
    }
    // Fallback to hash-based color selection for other player names
    const hash = playerId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return playerColors[Math.abs(hash) % playerColors.length];
  };

  const getCardClass = (card: CardState): string => {
    const baseClass = 'card';
    switch (card.status) {
      case 'down':
        return `${baseClass} face-down`;
      case 'my':
        return `${baseClass} my-card`;
      case 'up':
        // Use different colors for different players
        if (card.text && card.text.includes('(')) {
          // Extract player info from card text if available
          const playerMatch = card.text.match(/\(([^)]+)\)/);
          if (playerMatch) {
            const otherPlayer = playerMatch[1];
            return `${baseClass} other-card ${getPlayerColorClass(otherPlayer)}`;
          }
        }
        return `${baseClass} other-card`;
      case 'none':
        return `${baseClass} removed`;
      default:
        return baseClass;
    }
  };

  const getCardContent = (card: CardState): string => {
    return card.status === 'down' || card.status === 'none' ? '?' : card.text;
  };

  const isCardClickable = (card: CardState): boolean => {
    return card.status !== 'none';
  };

  const handleCardClick = (row: number, col: number, card: CardState) => {
    if (isCardClickable(card)) {
      onCardClick(row, col);
    }
  };

  return (
    <div className="game-board">
      <div 
        className="board-grid" 
        style={{ 
          gridTemplateColumns: `repeat(${dimensions.width}, 1fr)` 
        }}
      >
        {board.map((row, rowIndex) =>
          row.map((card, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={getCardClass(card)}
              onClick={() => handleCardClick(rowIndex, colIndex, card)}
              style={{ cursor: isCardClickable(card) ? 'pointer' : 'not-allowed' }}
            >
              {getCardContent(card)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GameBoard;
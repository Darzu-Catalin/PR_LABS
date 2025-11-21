import React from 'react';
import { CardState } from '../utils/boardParser';

interface GameBoardProps {
  board: CardState[][];
  dimensions: { height: number; width: number };
  onCardClick: (row: number, col: number) => void;
  currentPlayerId: string;
  waitingForCard: { row: number; col: number } | null;
}

const GameBoard: React.FC<GameBoardProps> = ({ board, dimensions, onCardClick, currentPlayerId, waitingForCard }) => {
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

  const getCardClass = (card: CardState, row: number, col: number): string => {
    const baseClass = 'card';
    
    // Check if this card is being waited for
    const isWaiting = waitingForCard && waitingForCard.row === row && waitingForCard.col === col;
    
    let statusClass = '';
    switch (card.status) {
      case 'down':
        statusClass = 'face-down';
        break;
      case 'my':
        statusClass = 'my-card';
        break;
      case 'up':
        // Distinguish between controlled and uncontrolled face-up cards
        if (card.text && card.text.includes('(')) {
          // Card is controlled by another player - use player color
          const playerMatch = card.text.match(/\(([^)]+)\)/);
          if (playerMatch) {
            const otherPlayer = playerMatch[1];
            statusClass = `other-card ${getPlayerColorClass(otherPlayer)}`;
          } else {
            statusClass = 'other-card';
          }
        } else {
          // Card is face-up but not controlled by anyone - use uncontrolled style
          statusClass = 'uncontrolled-card';
        }
        break;
      case 'none':
        statusClass = 'none';
        break;
      default:
        statusClass = '';
    }
    
    return `${baseClass} ${statusClass} ${isWaiting ? 'waiting-for-card' : ''}`.trim();
  };

  const getCardContent = (card: CardState): string => {
    return card.status === 'down' || card.status === 'none' ? '?' : card.text;
  };

  const isCardClickable = (card: CardState): boolean => {
    // All cards are now clickable, including 'none' cards
    return true;
  };

  const handleCardClick = (row: number, col: number, card: CardState) => {
    onCardClick(row, col);
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
              className={getCardClass(card, rowIndex, colIndex)}
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
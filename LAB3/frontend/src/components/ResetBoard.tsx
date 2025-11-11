import React, { useState } from 'react';

interface ResetBoardProps {
  onReset: () => Promise<void>;
  disabled?: boolean;
}

const ResetBoard: React.FC<ResetBoardProps> = ({ onReset, disabled = false }) => {
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onReset();
    } catch (error) {
      console.error('Reset failed:', error);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="reset-board">
      <button 
        className="button button-reset"
        onClick={handleReset}
        disabled={disabled || isResetting}
        title="Reset the board to start a new game"
      >
        {isResetting ? '🔄 Resetting...' : 'Reset Board'}
      </button>
      <p className="reset-note">
        This will reset the entire game board - all cards will become face down and the game state will be cleared for all players.
      </p>
    </div>
  );
};export default ResetBoard;
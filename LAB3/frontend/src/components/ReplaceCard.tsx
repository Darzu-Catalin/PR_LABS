import React, { useState } from 'react';

interface ReplaceCardProps {
  onReplace: (fromCard: string, toCard: string) => void;
  disabled: boolean;
}

const ReplaceCard: React.FC<ReplaceCardProps> = ({ onReplace, disabled }) => {
  const [fromCard, setFromCard] = useState('');
  const [toCard, setToCard] = useState('');

  const handleReplace = () => {
    if (fromCard.trim() && toCard.trim()) {
      onReplace(fromCard.trim(), toCard.trim());
      setFromCard('');
      setToCard('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleReplace();
    }
  };

  return (
    <div className="replace-card-container">
      <h3>Replace Cards</h3>
      <div className="replace-inputs">
        <div className="input-group">
          <label htmlFor="from-card">From:</label>
          <input
            id="from-card"
            type="text"
            value={fromCard}
            onChange={(e) => setFromCard(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., 🥦"
            disabled={disabled}
            maxLength={10}
          />
        </div>
        <span className="arrow">→</span>
        <div className="input-group">
          <label htmlFor="to-card">To:</label>
          <input
            id="to-card"
            type="text"
            value={toCard}
            onChange={(e) => setToCard(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., 🌞"
            disabled={disabled}
            maxLength={10}
          />
        </div>
      </div>
      <div className="replace-button-container">
        <button 
          className="button button-replace"
          onClick={handleReplace}
          disabled={disabled || !fromCard.trim() || !toCard.trim()}
        >
          Replace All Cards
        </button>
      </div>
      <p className="replace-note">
        This will replace all instances of the first emoji/symbol with the second one
      </p>
    </div>
  );
};

export default ReplaceCard;

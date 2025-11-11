import React, { useState } from 'react';

interface ReplaceFormProps {
  onReplace: (fromCard: string, toCard: string) => void;
}

const ReplaceForm: React.FC<ReplaceFormProps> = ({ onReplace }) => {
  const [fromCard, setFromCard] = useState('');
  const [toCard, setToCard] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromCard.trim() && toCard.trim()) {
      onReplace(fromCard.trim(), toCard.trim());
      setFromCard('');
      setToCard('');
    }
  };

  return (
    <form className="replace-form" onSubmit={handleSubmit}>
      <label>Replace cards:</label>
      <input
        type="text"
        placeholder="From card"
        value={fromCard}
        onChange={(e) => setFromCard(e.target.value)}
        required
      />
      <span>→</span>
      <input
        type="text"
        placeholder="To card"
        value={toCard}
        onChange={(e) => setToCard(e.target.value)}
        required
      />
      <button type="submit" className="button">
        Replace
      </button>
    </form>
  );
};

export default ReplaceForm;
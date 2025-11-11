import React, { useEffect, useState } from 'react';

export interface SnackbarMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface SnackbarProps {
  messages: SnackbarMessage[];
  onRemove: (id: string) => void;
}

const Snackbar: React.FC<SnackbarProps> = ({ messages, onRemove }) => {
  return (
    <div className="snackbar-container">
      {messages.map((msg) => (
        <SnackbarItem
          key={msg.id}
          message={msg}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

interface SnackbarItemProps {
  message: SnackbarMessage;
  onRemove: (id: string) => void;
}

const SnackbarItem: React.FC<SnackbarItemProps> = ({ message, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    const showTimer = setTimeout(() => setIsVisible(true), 10);
    
    // Auto-remove after duration
    const duration = message.duration || 4000;
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onRemove(message.id), 300); // Wait for fade out
    }, duration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(removeTimer);
    };
  }, [message.id, message.duration, onRemove]);

  const handleClick = () => {
    setIsVisible(false);
    setTimeout(() => onRemove(message.id), 300);
  };

  return (
    <div
      className={`snackbar-item snackbar-${message.type} ${isVisible ? 'visible' : ''}`}
      onClick={handleClick}
    >
      <span className="snackbar-message">{message.message}</span>
      <button className="snackbar-close" onClick={handleClick}>×</button>
    </div>
  );
};

export default Snackbar;
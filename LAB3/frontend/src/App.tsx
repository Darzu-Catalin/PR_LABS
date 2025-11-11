import React, { useState, useEffect, useCallback } from 'react';
import GameBoard from './components/GameBoard';
import ConnectionForm from './components/ConnectionForm';
import PlayerInfo from './components/PlayerInfo';
import ResetBoard from './components/ResetBoard';
import Snackbar, { SnackbarMessage } from './components/Snackbar';
import { parseBoard, CardState } from './utils/boardParser';

interface AppState {
  connected: boolean;
  serverUrl: string;
  playerId: string;
  board: CardState[][] | null;
  dimensions: { height: number; width: number } | null;
  status: string;
  error: string | null;
  isWatching: boolean;
  lastRefresh: number;
  snackbars: SnackbarMessage[];
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    connected: false,
    serverUrl: '',
    playerId: '',
    board: null,
    dimensions: null,
    status: 'Enter connection details to start playing',
    error: null,
    isWatching: false,
    lastRefresh: 0,
    snackbars: [],
  });

  const updateStatus = useCallback((status: string, error: string | null = null) => {
    setState(prev => ({ ...prev, status, error }));
  }, []);

  const addSnackbar = useCallback((message: string, type: SnackbarMessage['type'], duration?: number) => {
    const newSnackbar: SnackbarMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      message,
      type,
      duration,
    };
    
    setState(prev => ({
      ...prev,
      snackbars: [...prev.snackbars, newSnackbar],
    }));
  }, []);

  const removeSnackbar = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      snackbars: prev.snackbars.filter(snackbar => snackbar.id !== id),
    }));
  }, []);



  const apiCall = useCallback(async (endpoint: string): Promise<string> => {
    if (!state.connected) throw new Error('Not connected to server');
    
    const url = `${state.serverUrl}${endpoint}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`${response.status}: ${errorText}`);
      
      // Show specific snackbar messages for common errors
      if (response.status === 429) {
        addSnackbar('Too many requests. Please wait a moment.', 'warning');
      } else if (response.status === 409) {
        addSnackbar('Card is currently in use by another player', 'warning');
      } else if (response.status === 404) {
        addSnackbar('Game not found or card position invalid', 'error');
      } else if (response.status >= 500) {
        addSnackbar('Server error. Please try again.', 'error');
      }
      
      throw error;
    }
    
    return await response.text();
  }, [state.connected, state.serverUrl, addSnackbar]);

  const lookAtBoard = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
        updateStatus('Refreshing board...', null);
      }
      const boardData = await apiCall(`/look/${encodeURIComponent(state.playerId)}`);
      const { board, dimensions } = parseBoard(boardData);
      
      setState(prev => ({
        ...prev,
        board,
        dimensions,
        status: silent ? `Auto-synced ${new Date().toLocaleTimeString()}` : 'Board updated',
        error: null,
        lastRefresh: Date.now(),
      }));
    } catch (error) {
      if (!silent) {
        updateStatus('Failed to load board', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }, [apiCall, state.playerId, updateStatus]);

  const flipCard = useCallback(async (row: number, col: number) => {
    try {
      updateStatus('Flipping card...', null);
      const boardData = await apiCall(`/flip/${encodeURIComponent(state.playerId)}/${row},${col}`);
      const { board, dimensions } = parseBoard(boardData);
      
      // Check if it's a match by looking for face-up cards (status 'up' or 'my')
      const faceUpCards = board.flat().filter(card => card.status === 'up' || card.status === 'my');
      let message = 'Card flipped';
      
      if (faceUpCards.length === 2) {
        if (faceUpCards[0].text === faceUpCards[1].text) {
          message = 'Match found! 🎉';
          addSnackbar('Great match! Cards will stay revealed.', 'success');
        } else {
          message = 'No match - cards will flip back';
          addSnackbar('No match this time. Keep trying!', 'info');
        }
      } else if (board[row][col].status === 'up' || board[row][col].status === 'my') {
        addSnackbar(`Card revealed: ${board[row][col].text}`, 'info', 2000);
      }
      
      setState(prev => ({
        ...prev,
        board,
        dimensions,
        status: message,
        error: null,
      }));
    } catch (error) {
      updateStatus('Failed to flip card', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [apiCall, state.playerId, updateStatus]);



  const watchForChanges = useCallback(async () => {
    if (!state.connected || state.isWatching) return;
    
    setState(prev => ({ ...prev, isWatching: true }));
    
    try {
      updateStatus('Watching for changes...', null);
      const boardData = await apiCall(`/watch/${encodeURIComponent(state.playerId)}`);
      const { board, dimensions } = parseBoard(boardData);
      
      setState(prev => ({
        ...prev,
        board,
        dimensions,
        status: 'Board changed by another player',
        error: null,
        isWatching: false,
      }));
    } catch (error) {
      setState(prev => ({ ...prev, isWatching: false }));
      updateStatus('Watch failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [apiCall, state.playerId, state.connected, state.isWatching, updateStatus]);

  const connect = useCallback(async (serverUrl: string, playerId: string) => {
    if (!serverUrl.trim() || !playerId.trim()) {
      updateStatus('', 'Server URL and Player ID are required');
      addSnackbar('Please enter both server URL and player ID', 'warning');
      return;
    }

    const cleanUrl = serverUrl.startsWith('http') ? serverUrl : `http://${serverUrl}`;
    
    setState(prev => ({
      ...prev,
      serverUrl: cleanUrl,
      playerId: playerId.trim(),
      connected: false,
    }));

    try {
      updateStatus('Connecting to server...', null);
      
      // Test connection by doing a look
      const url = `${cleanUrl}/look/${encodeURIComponent(playerId.trim())}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
      }
      
      const boardData = await response.text();
      const { board, dimensions } = parseBoard(boardData);
      
      addSnackbar(`Welcome ${playerId.trim()}! Connected to game.`, 'success');
      
      setState(prev => ({
        ...prev,
        connected: true,
        board,
        dimensions,
        status: 'Connected successfully!',
        error: null,
      }));
    } catch (error) {
      updateStatus('Connection failed', error instanceof Error ? error.message : 'Unknown error');
      addSnackbar('Failed to connect to server. Check URL and try again.', 'error');
    }
  }, [updateStatus, addSnackbar]);

  const resetBoard = useCallback(async () => {
    if (!state.connected) {
      addSnackbar('Not connected to server', 'error');
      return;
    }

    try {
      updateStatus('Resetting board...', null);
      
      // Call the new reset endpoint
      const boardData = await apiCall(`/reset/${encodeURIComponent(state.playerId)}`);
      const { board, dimensions } = parseBoard(boardData);
      
      setState(prev => ({
        ...prev,
        board,
        dimensions,
        status: 'Board reset successfully!',
        error: null,
        lastRefresh: Date.now(),
      }));
      
      addSnackbar('Board reset! All cards are now face down and ready for a new game.', 'success', 4000);
      
    } catch (error) {
      updateStatus('Failed to reset board', error instanceof Error ? error.message : 'Unknown error');
      addSnackbar('Failed to reset board. Please try again.', 'error');
    }
  }, [state.connected, state.playerId, apiCall, updateStatus, addSnackbar]);

  const disconnect = useCallback(() => {
    addSnackbar('Disconnected from server', 'info');
    setState({
      connected: false,
      serverUrl: '',
      playerId: '',
      board: null,
      dimensions: null,
      status: 'Disconnected from server',
      error: null,
      isWatching: false,
      lastRefresh: 0,
      snackbars: [],
    });
  }, [addSnackbar]);

  // Continuous auto-refresh for real-time board updates
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (state.connected) {
      // Initial board load
      lookAtBoard();
      
      // Set up continuous refresh every 2 seconds
      intervalId = setInterval(() => {
        if (!state.isWatching) {
          lookAtBoard();
        }
      }, 2000);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [state.connected, lookAtBoard, state.isWatching]);

  // Also watch for real-time changes using the watch endpoint
  useEffect(() => {
    if (state.connected && !state.isWatching) {
      const timer = setTimeout(watchForChanges, 500);
      return () => clearTimeout(timer);
    }
  }, [state.connected, state.isWatching, watchForChanges]);

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">Memory Scramble</h1>
        <p className="subtitle">React Edition - Find matching pairs!</p>
      </div>

      {!state.connected ? (
        <ConnectionForm onConnect={connect} />
      ) : (
        <>
          <PlayerInfo 
            playerId={state.playerId}
            serverUrl={state.serverUrl}
            onDisconnect={disconnect}
            onRefresh={lookAtBoard}
          />
          
          {state.board && state.dimensions && (
            <GameBoard
              board={state.board}
              dimensions={state.dimensions}
              onCardClick={flipCard}
              currentPlayerId={state.playerId}
            />
          )}
          
          <ResetBoard 
            onReset={resetBoard}
            disabled={!state.connected}
          />
        </>
      )}

      <div className={`status ${state.error ? 'error' : state.isWatching ? 'waiting' : 'info'}`}>
        {state.error || state.status}
      </div>
      
      <Snackbar 
        messages={state.snackbars} 
        onRemove={removeSnackbar} 
      />
    </div>
  );
};

export default App;
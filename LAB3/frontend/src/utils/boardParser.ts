export interface CardState {
  status: 'down' | 'up' | 'my' | 'none';
  text: string;
  playerId?: string;
}

export interface ParsedBoard {
  board: CardState[][];
  dimensions: { height: number; width: number };
}

export function parseBoard(boardData: string): ParsedBoard {
  const lines = boardData.trim().split('\n');
  
  if (lines.length === 0) {
    throw new Error('Empty board data');
  }
  
  // Parse dimensions from first line
  const dimensionMatch = lines[0].match(/^(\d+)x(\d+)$/);
  if (!dimensionMatch) {
    throw new Error('Invalid board format: first line should be "HEIGHTxWIDTH"');
  }
  
  const height = parseInt(dimensionMatch[1], 10);
  const width = parseInt(dimensionMatch[2], 10);
  const totalCards = height * width;
  
  if (lines.length !== totalCards + 1) {
    throw new Error(`Expected ${totalCards + 1} lines, got ${lines.length}`);
  }
  
  // Parse cards
  const cards: CardState[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const parts = line.split(' ');
    
    if (parts.length === 0) {
      throw new Error(`Invalid card format at line ${i + 1}`);
    }
    
    const status = parts[0] as CardState['status'];
    const text = parts.slice(1).join(' ');
    
    if (!['down', 'up', 'my', 'none'].includes(status)) {
      throw new Error(`Invalid card status "${status}" at line ${i + 1}`);
    }
    
    cards.push({ status, text });
  }
  
  // Convert linear array to 2D array
  const board: CardState[][] = [];
  for (let i = 0; i < height; i++) {
    const row: CardState[] = [];
    for (let j = 0; j < width; j++) {
      row.push(cards[i * width + j]);
    }
    board.push(row);
  }
  
  return { board, dimensions: { height, width } };
}
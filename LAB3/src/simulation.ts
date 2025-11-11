import { Board } from './board.js';
import { look, flip } from './commands.js';

/**
 * Simulation script for a game of Memory Scramble.
 * Simulates multiple players making random moves with random timeouts.
 * 
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/perfect.txt';
    const board: Board = await Board.parseFromFile(filename);
    
    // Default dimensions
    let height = 4;
    let width = 4;
    
    try {
        // Get initial board state to determine dimensions
        const initialState = await look(board, 'init');
        const firstLine = initialState.split('\n')[0] ?? '';
        const match = firstLine.match(/^(\d+)x(\d+)$/);
        if (typeof match?.[1] === 'string' && typeof match?.[2] === 'string') {
            const h = parseInt(match[1], 10);
            const w = parseInt(match[2], 10);
            if (!isNaN(h) && !isNaN(w) && h > 0 && w > 0) {
                height = h;
                width = w;
            }
        }
    } catch (err) {
        console.warn('Could not determine board dimensions, using defaults:', err);
    }
    
    const players = 4;
    const tries = 100;
    const maxDelayMilliseconds = 200;

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii, width, height));
    }
    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);

    /** 
     * @param playerNumber player to simulate
     * @param boardWidth width of the game board
     * @param boardHeight height of the game board
     */
    async function player(playerNumber: number, boardWidth: number, boardHeight: number): Promise<void> {
        const playerId = `player${playerNumber}`;
        console.log(`\n--- Starting player ${playerId} ---`);

        // Initial board state
        console.log('Initial board state:');
        console.log(await look(board, playerId));

        for (let jj = 0; jj < tries; ++jj) {
            try {
                // Random delay before first flip
                await timeout(Math.random() * maxDelayMilliseconds);

                // Pick random positions for both flips
                const row1 = randomInt(boardHeight);
                const col1 = randomInt(boardWidth);
                
                console.log(`\n${playerId}: Attempting to flip first card at (${row1}, ${col1})`);
                
                try {
                    const firstFlipState = await flip(board, playerId, row1, col1);
                    console.log(`${playerId}: First flip result:\n${firstFlipState}`);
                } catch (err) {
                    if (err instanceof Error && err.message === 'invalid card position') {
                        console.log(`${playerId}: Invalid position (${row1}, ${col1}), skipping this attempt`);
                        continue;
                    }
                    if (err instanceof Error && err.message === 'card is controlled by another player') {
                        console.log(`${playerId}: Card at (${row1}, ${col1}) is controlled by another player, skipping`);
                        continue;
                    }
                    throw err; // Re-throw other errors
                }

                // Random delay before second flip
                await timeout(Math.random() * maxDelayMilliseconds);
                
                // Pick a random second card (might be same as first, that's okay - will fail)
                const row2 = randomInt(boardHeight);
                const col2 = randomInt(boardWidth);
                
                console.log(`\n${playerId}: Attempting to flip second card at (${row2}, ${col2})`);
                
                try {
                    const secondFlipState = await flip(board, playerId, row2, col2);
                    console.log(`${playerId}: Second flip result:\n${secondFlipState}`);
                } catch (err) {
                    if (err instanceof Error && err.message === 'invalid card position') {
                        console.log(`${playerId}: Invalid position (${row2}, ${col2}) for second flip`);
                        // First card will be cleaned up on next attempt
                        continue;
                    }
                    if (err instanceof Error && err.message === 'card is controlled by another player') {
                        console.log(`${playerId}: Card at (${row2}, ${col2}) is controlled by another player for second flip`);
                        // First card will be cleaned up on next attempt
                        continue;
                    }
                    throw err; // Re-throw other errors
                }

                // Look at the board after both flips
                const finalState = await look(board, playerId);
                console.log(`${playerId}: Board after both flips:\n${finalState}`);
                console.log('-------------------');

                // Add a delay after each turn to let the board update
                await timeout(maxDelayMilliseconds);

            } catch (err) {
                console.error(`${playerId}: attempt to flip a card failed:`, err);
            }
        }
        
        // Final board state
        console.log(`Final board state for ${playerId}:`);
        console.log(await look(board, playerId));
    }
}

/**
 * Random positive integer generator
 * 
 * @param max a positive integer which is the upper bound of the generated number
 * @returns a random integer >= 0 and < max
 */
function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
}


/**
 * @param milliseconds duration to wait
 * @returns a promise that fulfills no less than `milliseconds` after timeout() was called
 */
async function timeout(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
}

void simulationMain();

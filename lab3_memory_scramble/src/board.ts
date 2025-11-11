import assert from 'node:assert';
import fs from 'node:fs';

type CardCell = {
  card: string;
  faceUp: boolean;
  controller?: string;
};

type PlayerState = {
  firstCard?: { row: number; col: number };
  secondCard?: { row: number; col: number };
  hasMatch: boolean;
};

/**
 * Board ADT for the Memory Scramble game.
 * Mutable, concurrency-safe, and encapsulated.
 */
export class Board {
    private readonly height: number;
    private readonly width: number;
    private readonly board: CardCell[][];
    private readonly playerStates: Map<string, PlayerState> = new Map();
    private readonly listeners: ((b: string) => void)[] = [];
    private readonly claimLocks: Map<string, string> = new Map();
    private static readonly waitMs = Number('100');
    private static readonly noneCard = { row: -19527, col: -19527 };

    // Abstraction function:
    //   AF(height, width, board) = a memory game board where:
    //   - height × width represents the dimensions of the board
    //   - board[i][j] represents the card at row i, column j where:
    //     * card is the string value on the card
    //     * faceUp indicates if the card is face up (true) or face down (false)
    //     * controller is the ID of the player who turned the card face up (undefined if face down)
    
    // Representation invariant:
    //   - height > 0
    //   - width > 0
    //   - board.length === height
    //   - all rows in board have length === width
    //   - all card strings are non-empty
    //   - if a card has controller defined, then faceUp must be true
    //   - matching cards must have the same string value
    
    // Safety from rep exposure:
    //   - all fields are private and readonly
    //   - board array and its subarrays are never returned or exposed
    //   - deep copies are made when necessary

    /**
     * Create a new game board with the specified dimensions and cards.
     * 
     * @param height number of rows in the board
     * @param width number of columns in the board
     * @param cards 2D array of card values
     */
    private constructor(height: number, width: number, cards: string[][]) {
        this.height = height;
        this.width = width;
        this.board = cards.map(row =>
            row.map(card => ({ card, faceUp: false, controller: undefined }))
        );
        this.checkRep();
    }

    /**
     * Check that the rep invariant is satisfied right before creating a board instance.
     */
    private checkRep(): void {
        assert(this.height > 0, 'height must be positive');
        assert(this.width > 0, 'width must be positive');
        assert(this.board.length === this.height, 'board height must match height field');
        
        for (const row of this.board) {
            assert(row.length === this.width, 'all rows must have width length');
            for (const cell of row) {
                assert(cell.card.length > 0, 'card values must be non-empty');
                if (cell.controller !== undefined) {
                    assert(cell.faceUp, 'cards with controller must be face up');
                }
            }
        }
    }

    /**
     * A lighter-weight representation check used at the end of public API methods.
     * This verifies key properties quickly without the full, heavier assertions in
     * `checkRep()`.
     */
    private checkRepFunctions(): void {
        // Basic structural invariants
        assert(this.height > 0, 'height must be positive');
        assert(this.width > 0, 'width must be positive');
        assert(this.board.length === this.height, 'board height must match height field');
        
        for (const row of this.board) {
            assert(row !== undefined, 'row must exist');
            assert(row.length === this.width, 'all rows must have width length');
            for (const cell of row) {
                assert(cell !== undefined, 'cell must exist');
                assert(typeof cell.card === 'string', 'card must be a string');
                if (cell.card.length === 0) {
                    assert(!cell.faceUp, 'removed card must be face down');
                    assert(cell.controller === undefined, 'removed card must have no controller');
                }
                if (cell.controller !== undefined) {
                    assert(cell.faceUp, 'cards with controller must be face up');
                }
            }
        }
    }

    /**
     * Make a new board by parsing a file.
     * 
     * PS4 instructions: the specification of this method may not be changed.
     * 
     * @param filename path to game board file
     * @returns a new board with the size and cards from the file
     * @throws Error if the file cannot be read or is not a valid game board
     */
    public static async parseFromFile(filename: string): Promise<Board> {
        const content = await fs.promises.readFile(filename, 'utf-8');
        const lines = content.trim().split('\n');
        
        // Parse dimensions from first line
        const firstLine = lines[0]?.trim() ?? '';
        if (firstLine.length === 0) {
            throw new Error('empty board file');
        }
        const dimensionParts = firstLine.split('x');
        if (dimensionParts.length !== 2 || typeof dimensionParts[0] !== 'string' || dimensionParts[0].trim().length === 0 || typeof dimensionParts[1] !== 'string' || dimensionParts[1].trim().length === 0) {
            throw new Error('invalid board dimensions format');
        }

        const height = parseInt(dimensionParts[0].trim(), 10);
        const width = parseInt(dimensionParts[1].trim(), 10);
        
        if (isNaN(height) || isNaN(width) || height <= 0 || width <= 0) {
            throw new Error('invalid board dimensions');
        }

        if (lines.length < height + 1) {
            throw new Error('insufficient board rows');
        }

        // Parse the board
        const cards: string[][] = [];
        const cardCounts = new Map<string, number>();
        
        // Read all cards from the file (one per line)
        const allCards = lines.slice(1).map(line => line.trim()).filter(line => line.length > 0);
        
        // Validate total number of cards
        const totalCards = height * width;
        
        if (totalCards % 2 !== 0) {
            throw new Error('total number of cards must be even');
        }

        if (allCards.length !== totalCards) {
            throw new Error(`expected ${totalCards} cards (${height}x${width}), but got ${allCards.length} cards`);
        }
        
        // Convert linear array of cards into 2D array
        for (let i = 0; i < height; i++) {
            const row: string[] = [];
            for (let j = 0; j < width; j++) {
                const card = allCards[i * width + j];
                if (typeof card !== 'string' || card.length === 0) {
                    throw new Error(`missing card at position ${i * width + j}`);
                }
                row.push(card);
                // Count card occurrences for validation
                cardCounts.set(card, (cardCounts.get(card) ?? 0) + 1);
            }
            cards.push(row);
        }

        // Validate that all cards appear in pairs
        for (const [card, count] of cardCounts) {
            if (count % 2 !== 0) {
                throw new Error(`card "${card}" appears ${count} times, which is not a multiple of 2`);
            }
        }
        
        return new Board(height, width, cards);
    }

    /**
     * Internal helper to notify all watch() listeners.
     */
    private notifyAll(): void {
        const ls = [...this.listeners];
        this.listeners.length = 0;
        for (const fn of ls) fn(this.look("")); // any look to trigger
    }

    /**
     * Compute unique key for a cell.
     * @param row row index of the cell
     * @param col column index of the cell
     * @returns unique string key representing the cell
     */
    private cellKey(row: number, col: number): string {
        return `${row},${col}`;
    }
    /**
     * Attempt to claim a cell so the caller has exclusive rights to flip it first.
     * Only succeeds if no other player currently holds a claim.
     * @param row row index of the cell
     * @param col column index of the cell
     * @param owner playerId attempting the claim
     * @returns true if the claim was acquired, false otherwise
     */
    private tryClaimCell(row: number, col: number, owner: string): boolean {
        const k = this.cellKey(row, col);
        if (this.claimLocks.has(k)) return false;
        this.claimLocks.set(k, owner);
        return true;
    }
    /**
     * Release a previously-claimed cell if owned by the caller.
     * @param row row index of the cell
     * @param col column index of the cell
     * @param owner playerId that owns the claim
     */
    private releaseClaim(row: number, col: number, owner: string): void {
        const k = this.cellKey(row, col);
        if (this.claimLocks.get(k) === owner) this.claimLocks.delete(k);
    }

    /**
     * Cleanup previous round before a new first flip.
     *
     * @param playerId ID of player whose previous move to clean up
     */
    private cleanupPreviousMove(playerId: string): void {
        const state = this.playerStates.get(playerId);
        if (!state) return;

        if (state.hasMatch && state.firstCard !== undefined && state.secondCard !== undefined) {
            // Rule 3-A: Remove matching cards from board
            const first = this.board[state.firstCard.row]?.[state.firstCard.col];
            const second = this.board[state.secondCard.row]?.[state.secondCard.col];
            
            // Remove the matched cards
            if (first) {
                first.card = '';
                first.faceUp = false;
                first.controller = undefined;
            }
            if (second) {
                second.card = '';
                second.faceUp = false;
                second.controller = undefined;
            }
            this.playerStates.set(playerId, { hasMatch: false });
        } else if (!state.hasMatch && state.firstCard !== undefined && state.secondCard !== undefined) {
            // Rule 3-B: Turn face-up uncontrolled cards face down
            const isCardInPlayerStates = (row: number, col: number): boolean => {
                for (const [pid, pState] of this.playerStates.entries()) {
                    if (pid === playerId) continue; // Skip current player
                    if ((pState.firstCard?.row === row && pState.firstCard?.col === col) ||
                        (pState.secondCard?.row === row && pState.secondCard?.col === col)) {
                        return true;
                    }
                }
                return false;
            };

            if (state.firstCard !== undefined) {
                const first = this.board[state.firstCard.row]?.[state.firstCard.col];
                if (first !== undefined && (first.faceUp ?? false) && first.controller === undefined) {
                    // Only turn face down if no other player has this card in their state
                    if (!isCardInPlayerStates(state.firstCard.row, state.firstCard.col)) {
                        first.faceUp = false;
                    }
                }
            }
            if (state.secondCard === Board.noneCard) {
                this.playerStates.set(playerId, { hasMatch: false });
                this.notifyAll();
                return;
            }
            if (state.secondCard !== undefined) {
                const second = this.board[state.secondCard.row]?.[state.secondCard.col];
                if (second !== undefined && (second.faceUp ?? false) && second.controller === undefined) {
                    // Only turn face down if no other player has this card in their state
                    if (!isCardInPlayerStates(state.secondCard.row, state.secondCard.col)) {
                        second.faceUp = false;
                    }
                }
            }
            this.playerStates.set(playerId, { hasMatch: false });
        } 
        return;
    }

    /**
     * Looks at the current state of the board.
     *
     * @param playerId ID of player looking at the board; 
     *                 must be a nonempty string of alphanumeric or underscore characters
     * @returns the state of the board from the perspective of playerId, in the format 
     *          described in the ps4 handout
     */
    public look(playerId: string): string {
        const lines: string[] = [`${this.height}x${this.width}`];
        for (const row of this.board) {
        for (const cell of row) {
            let status = "down";
            let text = "";
            if (cell.card.length === 0) status = "none";
            else if (!cell.faceUp) status = "down";
            else if (cell.controller === playerId) {
            status = "my";
            text = cell.card;
            } else {
            status = "up";
            text = cell.card;
            }
            lines.push(`${status} ${text}`.trim());
        }
        }
        const out = lines.join("\n");
        this.checkRepFunctions();
        return out;
    }

    /**
     * Tries to flip over a card on the board, following the rules in the ps4 handout.
     * If another player controls the card, then this operation waits until the flip 
     * either becomes possible or fails.
     *
     * @param playerId ID of player making the flip; 
     *                 must be a nonempty string of alphanumeric or underscore characters
     * @param row row number of card to flip;
     *            must be an integer in [0, height of board), indexed from the top of the board
     * @param column column number of card to flip; 
     *               must be an integer in [0, width of board), indexed from the left of the board
     * @returns the state of the board after the flip from the perspective of playerId, in the 
     *          format described in the ps4 handout
     * @throws an error (in a rejected promise) if the flip operation fails as described 
     *         in the ps4 handout.
     */
    public async flip(playerId: string, row: number, column: number): Promise<string> {
        // Get or initialize player state
        let state = this.playerStates.get(playerId);
        if (!state) {
            state = { hasMatch: false };
            this.playerStates.set(playerId, state);
        }

        // Validate position
        if (row < 0 || row >= this.height || column < 0 || column >= this.width) {
            throw new Error('invalid card position');
        }
        
        // Always attempt to clean up any previous move for this player before proceeding.
        this.cleanupPreviousMove(playerId);
        state = this.playerStates.get(playerId) ?? { hasMatch: false };
        this.playerStates.set(playerId, state);

        const cell = this.board[row]?.[column];

        if (cell === undefined || cell.card.length === 0) {
            // Rule 1-A and 2-A: No card there
            if (state.firstCard) {
                // Release control of first card if this was second flip
                const firstCard = this.board[state.firstCard.row]?.[state.firstCard.col];
                if (firstCard) {
                    firstCard.controller = undefined;
                    state.secondCard = Board.noneCard;
                    // Wake any waiters after releasing control so they can proceed
                    this.notifyAll();
                }

            }
            throw new Error('invalid card position');
        }
        

        // Handle first card flip
        if (!state.firstCard) {
            // Rule 1-D: If card is controlled by another player, wait.
            while (cell.faceUp && typeof cell.controller === 'string' && cell.controller !== playerId) {
                // Await a board-level change; when notified, re-check the cell.
                await this.watch(playerId);
                // If the card is gone (removed by a match), fail
                if (cell.card.length === 0) {
                    throw new Error('card was removed while waiting');
                }
            }

            // Here card may be uncontrolled. Use a claim lock.
            for (;;) {
                if (cell.card.length === 0) {
                    throw new Error('card was removed while waiting');
                }

                // If someone else currently controls it, wait again.
                if (typeof cell.controller === 'string' && cell.controller !== playerId) {
                    await this.watch(playerId);
                    continue;
                }

                // Try to claim first rights on this cell
                if (this.tryClaimCell(row, column, playerId)) {
                    try {
                        // Double-check invariants after acquiring the claim
                        if (cell.card.length === 0) {
                            throw new Error('card was removed while waiting');
                        }
                        if (typeof cell.controller === 'string' && cell.controller !== playerId) {
                            // Lost the race to a different controller; loop and wait
                            await this.watch(playerId);
                            continue;
                        }

                        // Rules 1-B and 1-C: flip face up and take control
                        cell.faceUp = true;
                        cell.controller = playerId;
                        state.firstCard = { row, col: column };
                        this.playerStates.set(playerId, state);
                        this.notifyAll();
                        const out = this.look(playerId);
                        this.checkRepFunctions();
                        return out;
                    } finally {
                        this.releaseClaim(row, column, playerId);
                    }
                } else {
                    // Someone else is currently claiming; wait for next change
                    await this.watch(playerId);
                }
            }
        }

        // Handle second card flip
        // Rule 2-B: Fail if card is controlled. 
        if (cell.faceUp && typeof cell.controller === 'string') {
            const firstCard = this.board[state.firstCard.row]?.[state.firstCard.col];
            if (firstCard) {
                firstCard.controller = undefined;
                state.secondCard = Board.noneCard;
                // Wake waiters that may be waiting on the first card
                this.notifyAll();
            }
            throw new Error('card is controlled by another player');
        }

        // Rule 2-C: Turn face up
        cell.faceUp = true;

        const firstCard = this.board[state.firstCard.row]?.[state.firstCard.col];

        if (firstCard === undefined) {
            state.firstCard = undefined;
            throw new Error('first card no longer exists');
        }

        // Rules 2-D and 2-E: Check for match
        if (cell.card === firstCard.card) {
            // Matching pair - keep control
            cell.controller = playerId;
            state.hasMatch = true;
            // Keep control of both cards until next move
            firstCard.controller = playerId;
            // Store both card positions for cleanup
            state.secondCard = { row, col: column };
            // Keep firstCard position for cleanup (don't set to undefined)
        } else {
            // Not a match - relinquish control but keep cards face up
            cell.controller = undefined;
            firstCard.controller = undefined;
            state.secondCard = { row, col: column };
            state.hasMatch = false;
            // Clear first card since it wasn't a match
            // state.firstCard = undefined;
        }

        // Save the updated state
        this.playerStates.set(playerId, state);
        this.notifyAll();
        {
            const out = this.look(playerId);
            this.checkRepFunctions();
            return out;
        }
    }


    /**
     * Modifies board by replacing every card with f(card), without affecting other state of the game.
     * 
     * This operation must be able to interleave with other operations, so while a map() is in progress,
     * other operations like look() and flip() should not throw an unexpected error or wait for the map() to finish.
     * But the board must remain observably pairwise consistent for players: if two cards on the board match 
     * each other at the start of a call to map(), then while that map() is in progress, it must not
     * cause any player to observe a board state in which that pair of cards do not match.
     *
     * Two interleaving map() operations should not throw an unexpected error, or force each other to wait,
     * or violate pairwise consistency, but the exact way they must interleave is not specified.
     *
     * f must be a mathematical function from cards to cards: 
     * given some legal card `c`, f(c) should be a legal replacement card which is consistently 
     * the same every time f(c) is called for that same `c`.
     * 
     * @param playerId ID of player applying the map; 
     *                 must be a nonempty string of alphanumeric or underscore characters
     * @param f mathematical function from cards to cards
     * @returns the state of the board after the replacement from the perspective of playerId,
     *          in the format described in the ps4 handout
     */
    public async map(playerId: string, f: (card: string) => Promise<string>): Promise<string> {
        const replacements = new Map<string, string>();
        
        // Replace all cards
        for (const row of this.board) {
            for (const cell of row) {
                if (cell.card.length === 0) continue;
                if (!replacements.has(cell.card)) {
                    replacements.set(cell.card, await f(cell.card));
                }
                cell.card = replacements.get(cell.card) ?? cell.card;
            }
        }
        
        this.notifyAll();
        {
            const out = this.look(playerId);
            this.checkRepFunctions();
            return out;
        }
    }

    /**
     * Watches the board for a change, waiting until any cards turn face up or face down, 
     * are removed from the board, or change from one string to a different string.
     *
     * @param playerId ID of player watching the board; 
     *                 must be a nonempty string of alphanumeric or underscore characters
     * @returns the updated state of the board from the perspective of playerId, in the 
     *          format described in the ps4 handout
     */
    public async watch(playerId: string): Promise<string> {
        const p = new Promise<string>(resolve => {
            this.listeners.push(() => resolve(this.look(playerId)));
        });
        this.checkRepFunctions();
        return p;
    }
}

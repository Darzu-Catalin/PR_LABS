/**
 * String-based commands provided by the Memory Scramble game.
 *
 * PS4 instructions: these are required functions.
 * You MUST NOT change the names, type signatures, or specs of these functions.
 */
/**
 * Looks at the current state of the board.
 *
 * @param board a Memory Scramble board
 * @param playerId ID of player looking at the board
 * @returns the state of the board from the perspective of playerId
 */
export async function look(board, playerId) {
    return board.look(playerId);
}
/**
 * Tries to flip over a card on the board.
 *
 * @param board a Memory Scramble board
 * @param playerId ID of player making the flip
 * @param row row number of card to flip
 * @param column column number of card to flip
 * @returns the state of the board after the flip
 */
export async function flip(board, playerId, row, column) {
    return board.flip(playerId, row, column);
}
/**
 * Applies a mapping function to all cards on the board.
 *
 * @param board a Memory Scramble board
 * @param playerId ID of player applying the map
 * @param f function to apply to each card
 * @returns the state of the board after the mapping
 */
export async function map(board, playerId, f) {
    return board.map(playerId, c => f(c));
}
/**
 * Watches the board for changes.
 *
 * @param board a Memory Scramble board
 * @param playerId ID of player watching the board
 * @returns the updated state of the board when a change occurs
 */
export async function watch(board, playerId) {
    return board.watch(playerId);
}
/**
 * Resets the board to its initial state.
 *
 * @param board a Memory Scramble board
 * @param playerId ID of player requesting the reset
 * @returns the state of the board after reset
 */
export async function reset(board, playerId) {
    return board.reset(playerId);
}
//# sourceMappingURL=commands.js.map
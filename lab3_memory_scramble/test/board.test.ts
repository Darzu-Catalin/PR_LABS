import assert from 'node:assert';
import { Board } from '../src/board.js';

/**
 * Tests for the Board abstract data type.
 */
describe('Board', function() {
    // Testing strategy
    //
    // parseFromFile():
    //   - valid board files with different dimensions
    //   - invalid board files: empty, wrong dimensions, missing cards
    //   - boards with different card patterns (pairs, symbols)
    //
    // look():
    //   - board with no face-up cards
    //   - board with some face-up cards controlled by viewer
    //   - board with some face-up cards controlled by others
    //   - board with removed cards (empty spaces)
    //
    // flip():
    //   - first card flip:
    //     * valid position, uncontrolled card - 1-B, 1-C, 3-A, 3-B
    //     * valid position, card controlled by others (should wait) - 1-D
    //     * invalid position (out of bounds, empty space) - 1-A
    //   - second card flip:
    //     * matching pair - 2-C, 2-D
    //     * non-matching pair - 2-E
    //     * controlled card - 2-B
    //     * card removed during play - 2-A
    //
    // map():
    //   - simple card replacement
    //   - maintaining pair consistency
    //   - multiple simultaneous mappings
    //   - mapping with face-up cards
    //
    // watch():
    //   - notified when cards flip
    //   - notified when cards are removed
    //   - notified when cards change value
    //   - multiple watchers

    describe('parseFromFile() tests', function() {
        // Test valid boards
        it('parses a valid board with same dimensions', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            assert(board.look('player1').startsWith('4x4'));
        });

        it('parses a valid board with different dimensions', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            assert(board.look('player1').startsWith('4x5'));
        });

        
        // Test invalid boards
        it('rejects empty board file', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_empty.txt'),
                (err) => {
                    assert(err instanceof Error);
                    assert.strictEqual(err.message, 'empty board file');
                    return true;
                }
            );
        });

        it('rejects invalid board dimensions', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_dimensions.txt'),
                (err) => {
                    assert(err instanceof Error);
                    assert.strictEqual(err.message, 'total number of cards must be even');
                    return true;
                }
            );
        });

        it('rejects if missing cards', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_mis_cards.txt'),
                (err) => {
                    assert(err instanceof Error);
                    assert(err.message.includes('expected') && err.message.includes('cards'), 
                        'Error should mention expected number of cards');
                    return true;
                }
            );
        });

        // Test different card patterns
        it('rejects boards with different card patterns', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_patterns.txt'),
                (err) => {
                    assert(err instanceof Error);
                    assert(err.message.includes('multiple of 2'), 
                        'Error should mention multiple of 2 requirement');
                    return true;
                }
            );
        });
    });

    describe('look() tests', function() {
        // Test board with no face-up cards
        it('shows all cards face down initially', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const view = board.look('player1');
            const lines = view.split('\n');
            assert(lines[0] === '4x4', 'Should show correct dimensions');
            
            const cardLines = lines.slice(1);
            assert(cardLines.every(line => line === 'down'), 
                'All cards should be face down initially');
        });

        // Test board with face-up cards controlled by viewer
        it('shows my cards when controlled by viewer', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('player1', 0, 0);
            const view = board.look('player1');
            const lines = view.split('\n');
            
            // Should find exactly one face-up card controlled by player1
            const myCards = lines.filter(line => line.startsWith('my'));
            assert.strictEqual(myCards.length, 1, 'Should see one card controlled by me');
            const myCard = myCards[0];
            assert(myCard, 'Should have a card controlled by me');
            assert(myCard.includes('🦄') || myCard.includes('🌈'), 
                'Should show the actual card value');
        });

        // Test board with face-up cards controlled by others
        it('shows face-up cards controlled by others', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            await board.flip('player2', 0, 0);            
            const view = board.look('player1');
            const lines = view.split('\n');
            
            const upCards = lines.filter(line => line.startsWith('up'));
            assert.strictEqual(upCards.length, 1, 'Should see one card face up');
            const upCard = upCards[0];
            assert(upCard, 'Should have a face-up card');
            assert(upCard.includes('🦄') || upCard.includes('🌈'), 
                'Should show the actual card value');
        });

        // Test board with removed cards
        it('shows empty spaces for removed cards', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            await board.flip('player1', 0, 0);
            await board.flip('player1', 0, 1);
            await board.flip('player1', 0, 2);
            const view = board.look('player1');
            const lines = view.split('\n');
            assert(lines[1] === 'none', 'Position (0,0) should be empty');
            assert(lines[2] === 'none', 'Position (0,1) should be empty');
        });
    });

    describe('flip() tests', function() {
        // Test first card flip: valid position, uncontrolled card - rule 1-B, 1-C
        it('allows flipping an uncontrolled card as first card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const result = await board.flip('player1', 0, 0);
            const lines = result.split('\n');
            const firstCard = lines[1];  // First card should be the one we flipped
            assert(firstCard, 'Should have a first card in result');
            assert(firstCard.startsWith('my'), 'First flipped card should be controlled by player');
            assert(firstCard.includes('🦄') || firstCard.includes('🌈'), 
                'Should show the card value');
        });

        // Test first card flip: card controlled by others (should wait) - rule 1-D
        it('waits for card controlled by others', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Player 2 flips first
            await board.flip('player2', 0, 0);
            
            // Player 1 attempts to flip same card (should wait)
            const player1Promise = board.flip('player1', 0, 0);
            
            // Player 2 flips second card to complete their turn
            setTimeout(async () => {
                await board.flip('player2', 1, 0);
            }, 100);
            
            // Now player 1's flip should complete
            const result = await player1Promise;
            assert(result.includes('my'), 'Card should now be controlled by player1');
        });

        // Test first card flip: invalid positions - rule 1-A
        it('rejects invalid card positions', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Test out of bounds positions
            await assert.rejects(
                async () => await board.flip('player1', -1, 0),
                /invalid card position/
            );
            
            await assert.rejects(
                async () => await board.flip('player1', 0, -1),
                /invalid card position/
            );
            
            await assert.rejects(
                async () => await board.flip('player1', 4, 0),
                /invalid card position/
            );
            
            await assert.rejects(
                async () => await board.flip('player1', 0, 4),
                /invalid card position/
            );
        });

        // Test second card flip: matching pair
        it('handles matching pair correctly', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Flip first card
            const firstResult = await board.flip('player1', 0, 0);
            const lines = firstResult.split('\n');
            const firstCard = lines[1];
            assert(firstCard, 'Should have first card');
            const firstCardValue = firstCard.split(' ')[1];
            assert(firstCardValue, 'Should have card value');
            
            // Find and flip matching card
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    if (i === 0 && j === 0) continue;  // Skip the first card
                    try {
                        const result = await board.flip('player1', i, j);
                        if (result.includes(firstCardValue)) {
                            // Found matching card, verify both are controlled
                            const resultLines = result.split('\n').slice(1);
                            const myCards = resultLines.filter(line => line.startsWith('my'));
                            assert.strictEqual(myCards.length, 2, 
                                'Both cards should be controlled after match');
                            return;
                        }
                    } catch (e) {
                        // Skip invalid positions or controlled cards
                        continue;
                    }
                }
            }
            assert.fail('Should have found a matching pair');
        });

        // Test second card flip: non-matching pair
        it('handles non-matching pair correctly', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Flip first card (🦄)
            await board.flip('player1', 0, 0);
            
            // Flip non-matching card (🌈)
            await board.flip('player1', 0, 2);
            
            // Both cards should be face up but not controlled
            const result = board.look('player1');
            const lines = result.split('\n').slice(1);
            const upCards = lines.filter(line => line.startsWith('up'));
            assert.strictEqual(upCards.length, 2, 
                'Non-matching cards should be face up but not controlled');
        });

        // Test second card flip: controlled card
        it('rejects flipping controlled card as second card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Player 1 flips first card
            await board.flip('player1', 0, 0);
            
            // Player 2 controls a card
            await board.flip('player2', 1, 0);
            
            // Player 1 tries to flip Player 2's card
            await assert.rejects(
                async () => await board.flip('player1', 1, 0),
                /card is controlled by another player/
            );
        });

        // Test second card flip: card removed during play
        it('handles removed cards correctly', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Player 1 flips two cards at 0,0 and 0,1
            await board.flip('player1', 0, 0);
            await board.flip('player1', 0, 1);
            
            // Flip a third card to trigger card removal
            await board.flip('player1', 0, 2);
            
            // Check that the original positions are now empty
            const view = board.look('player1');
            const lines = view.split('\n').slice(1); // Skip dimensions line
            assert.strictEqual(lines[0], 'none', 'Position (0,0) should be empty');
            assert.strictEqual(lines[1], 'none', 'Position (0,1) should be empty');
        });
    });

    describe('map() tests', function() {
        // Test simple card replacement
        it('performs simple card replacement', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // First flip a card to see its face-up value
            await board.flip('player1', 0, 0);
            const initialView = board.look('player1');
            const lines = initialView.split('\n');
            const firstLine = lines[1];
            assert(firstLine, 'Expected at least one card');
            const parts = firstLine.split(' ');
            const originalCard = parts[1];
            assert(originalCard, 'Expected card value');
            
            // Map unicorn to star if found, otherwise keep original
            const replacementEmoji = '⭐️';
            await board.map('player1', async (card) => 
                card === '🦄' ? replacementEmoji : card
            );
            
            // Look at the board after mapping
            const result = board.look('player1');
            const resultLines = result.split('\n').slice(1); // Skip dimensions line
            
            // If the original card was a unicorn, it should be replaced
            if (originalCard === '🦄') {
                const cardLine = resultLines.find(line => line.includes('my'));
                assert(cardLine?.includes(replacementEmoji), 
                    'Face-up unicorn should be replaced with star');
            }
            
            // Flip all cards to verify the mapping
            let foundReplacement = false;
            for (let i = 0; i < 4 && !foundReplacement; i++) {
                for (let j = 0; j < 4; j++) {
                    try {
                        const flipResult = await board.flip('player1', i, j);
                        if (flipResult.includes(replacementEmoji)) {
                            foundReplacement = true;
                            break;
                        }
                    } catch (e) {
                        // Skip invalid positions or already flipped cards
                        continue;
                    }
                }
            }
            
            assert(foundReplacement, 'Should find at least one replaced unicorn card');
        });

        // Test maintaining pair consistency
        it('maintains pair consistency during mapping', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // First flip a card to see its value
            await board.flip('player1', 0, 0);
            const view = board.look('player1');
            const lines = view.split('\n');
            const firstLine = lines[1];
            assert(firstLine, 'Expected at least one card');
            const parts = firstLine.split(' ');
            assert(parts[1], 'Expected card value');
            const firstCardValue = parts[1];
            
            // Map only this specific card value
            await board.map('player1', async (card) => 
                card === firstCardValue ? 'MAPPED' : card
            );
            
            // Check that both cards in the pair were mapped
            await board.flip('player1', 0, 1);
            const finalView = board.look('player1');
            const mappedLines = finalView.split('\n').slice(1); // Skip dimensions line
            const mappedCount = mappedLines.filter(line => line.includes('MAPPED')).length;
            assert.strictEqual(mappedCount, 2, 'Both cards in pair should be mapped');
        });

        // Test multiple simultaneous mappings
        it('handles multiple simultaneous mappings', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Start multiple map operations simultaneously
            const promises = [
                board.map('player1', async (card) => card + '_1'),
                board.map('player2', async (card) => card + '_2')
            ];
            
            await Promise.all(promises);
            const result = board.look('player1');
            
            // Verify that mappings occurred and pairs are maintained
            const lines = result.split('\n').slice(1);
            const cardCounts = new Map();
            for (const line of lines) {
                const card = line.split(' ')[1];
                if (card) {
                    cardCounts.set(card, (cardCounts.get(card) || 0) + 1);
                }
            }
            
            // Check all cards appear in pairs
            for (const [_, count] of cardCounts) {
                assert(count % 2 === 0, 'Cards should still appear in pairs after multiple mappings');
            }
        });

        // Test mapping with face-up cards
        it('maps face-up cards correctly', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Flip a card first
            await board.flip('player1', 0, 0);
            
            // Perform mapping
            await board.map('player1', async (card) => card + '_mapped');
            
            const result = board.look('player1');
            assert(result.includes('_mapped'), 'Face-up cards should be mapped');
            
            // Verify the card is still face-up and controlled
            assert(result.includes('my'), 'Mapped card should maintain its face-up state');
        });
    });

    describe('watch() tests', function() {
        // Test notification when cards flip
        it('notifies when cards are flipped', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Start watching
            const watchPromise = board.watch('watcher');
            
            // Flip a card
            setTimeout(async () => {
                await board.flip('player1', 0, 0);
            }, 100);
            
            const result = await watchPromise;
            assert(result.includes('up') || result.includes('my'), 
                   'Watch should detect card flip state change');
        });

        // Test notification when cards are removed
        it('notifies when cards are removed', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('player1', 0, 0);
            await board.flip('player1', 0, 1);
            
            // Start watching
            const watchPromise = board.watch('watcher');
            
            // Make a matching pair to remove cards
            setTimeout(async () => {
                await board.flip('player1', 0, 2);
                const view = board.look('player1');
                const lines = view.split('\n');
                const firstLine = lines[1];
                assert(firstLine, 'Expected at least one card');
                const parts = firstLine.split(' ');
                const firstCard = parts[1];
                assert(firstCard, 'Expected card value');
            }, 100);
            
            const result = await watchPromise;
            assert(result.includes('none'), 'Watch should detect card removal');
        });

        // Test notification when cards change value
        it('notifies when cards change value', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('player1', 0, 0);

            // Start watching
            const watchPromise = board.watch('watcher');
            
            // Change card values
            setTimeout(async () => {
                await board.map('player1', async (card) => card + '_changed');
            }, 100);
            
            const result = await watchPromise;
            assert(result.includes('_changed'), 'Watch should detect card value changes');
        });

        // Test multiple watchers
        it('notifies multiple watchers', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Start multiple watchers
            const watchPromise1 = board.watch('watcher1');
            const watchPromise2 = board.watch('watcher2');
            
            // Make a change
            setTimeout(async () => {
                await board.flip('player1', 0, 0);
            }, 100);
            
            // Wait for both notifications
            const [result1, result2] = await Promise.all([watchPromise1, watchPromise2]);
            
            assert(result1.includes('up') || result1.includes('my'), 
                   'First watcher should be notified of change');
            assert(result2.includes('up') || result2.includes('my'), 
                   'Second watcher should be notified of change');
            assert.deepStrictEqual(result1, result2, 
                   'Both watchers should receive the same board state');
        });
    });
});

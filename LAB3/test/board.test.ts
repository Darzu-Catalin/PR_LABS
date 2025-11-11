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

    describe('🎯 Board File Parsing Tests', function() {
        // Test valid boards
        it('✅ Successfully loads a perfectly square game board', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            assert(board.look('TestPlayer_Alpha').startsWith('4x4'));
        });

        it('🔲 Handles rectangular board layouts correctly', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            assert(board.look('TestPlayer_Beta').startsWith('4x5'));
        });

        
        // Test invalid boards
        it('❌ Properly rejects completely empty game files', async function() {
            await assert.rejects(
                async () => await Board.parseFromFile('boards/invalid_empty.txt'),
                (err) => {
                    assert(err instanceof Error);
                    assert.strictEqual(err.message, 'empty board file');
                    return true;
                }
            );
        });

        it('⚠️ Catches odd-numbered card configurations', async function() {
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

    describe('👀 Board Viewing & State Tests', function() {
        // Test board with no face-up cards
        it('🔒 Displays pristine game board with all cards hidden', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const view = board.look('GameMaster_001');
            const lines = view.split('\n');
            assert(lines[0] === '4x4', 'Game grid dimensions must be accurate');
            
            const cardLines = lines.slice(1);
            assert(cardLines.every(line => line === 'down'), 
                'Fresh game board should have zero revealed cards');
        });

        // Test board with face-up cards controlled by viewer
        it('🎮 Highlights player-controlled cards with ownership markers', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flip('Champion_X', 0, 0);
            const view = board.look('Champion_X');
            const lines = view.split('\n');
            
            // Should find exactly one face-up card controlled by Champion_X
            const myCards = lines.filter(line => line.startsWith('my'));
            assert.strictEqual(myCards.length, 1, 'Player should own exactly one revealed card');
            const myCard = myCards[0];
            assert(myCard, 'Controlled card must be visible in game state');
            assert(myCard.includes('🦄') || myCard.includes('🌈'), 
                'Card content should display magical creatures');
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

    describe('🃏 Card Flipping Mechanics', function() {
        // Test first card flip: valid position, uncontrolled card - rule 1-B, 1-C
        it('🎯 Executes clean first-card reveal with instant ownership', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const result = await board.flip('Strategist_001', 0, 0);
            const lines = result.split('\n');
            const firstCard = lines[1];  // First card should be the one we flipped
            assert(firstCard, 'Initial card flip must generate valid result');
            assert(firstCard.startsWith('my'), 'Revealed card gains immediate player ownership');
            assert(firstCard.includes('🦄') || firstCard.includes('🌈'), 
                'Card must reveal enchanted creature symbols');
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
        it('🎉 Celebrates successful pair matches with dual ownership', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Flip first card
            const firstResult = await board.flip('MatchMaker_Pro', 0, 0);
            const lines = firstResult.split('\n');
            const firstCard = lines[1];
            assert(firstCard, 'Primary card flip must succeed');
            const firstCardValue = firstCard.split(' ')[1];
            assert(firstCardValue, 'Card must contain readable symbol value');
            
            // Find and flip matching card
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    if (i === 0 && j === 0) continue;  // Skip the first card
                    try {
                        const result = await board.flip('MatchMaker_Pro', i, j);
                        if (result.includes(firstCardValue)) {
                            // Found matching card, verify both are controlled
                            const resultLines = result.split('\n').slice(1);
                            const myCards = resultLines.filter(line => line.startsWith('my'));
                            assert.strictEqual(myCards.length, 2, 
                                'Perfect match grants control of both magical cards');
                            return;
                        }
                    } catch (e) {
                        // Skip invalid positions or controlled cards
                        continue;
                    }
                }
            }
            assert.fail('Matching pair discovery should be guaranteed in perfect board');
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

    describe('👁️ Real-time Board Monitoring System', function() {
        // Test notification when cards flip
        it('🚨 Instantly alerts observers to card reveal events', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Start watching
            const watchPromise = board.watch('GameObserver_Alpha');
            
            // Flip a card
            setTimeout(async () => {
                await board.flip('ActivePlayer_001', 0, 0);
            }, 100);
            
            const result = await watchPromise;
            assert(result.includes('up') || result.includes('my'), 
                   'Real-time monitoring must capture card state transitions');
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
        it('📡 Broadcasts synchronized updates to all surveillance agents', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            
            // Start multiple watchers
            const watchPromise1 = board.watch('SurveillanceBot_X');
            const watchPromise2 = board.watch('MonitorDrone_Z');
            
            // Make a change
            setTimeout(async () => {
                await board.flip('TriggerAgent_001', 0, 0);
            }, 100);
            
            // Wait for both notifications
            const [result1, result2] = await Promise.all([watchPromise1, watchPromise2]);
            
            assert(result1.includes('up') || result1.includes('my'), 
                   'Primary surveillance unit must detect activity');
            assert(result2.includes('up') || result2.includes('my'), 
                   'Secondary monitor drone must capture identical event');
            assert.deepStrictEqual(result1, result2, 
                   'All surveillance agents receive synchronized intelligence');
        });
    });
});

/**
 * Player configuration persistence via localStorage.
 */
const NAME_KEY = 'hired_swords_player_name';

export const PlayerConfig = {
  getName() {
    return localStorage.getItem(NAME_KEY) || '';
  },

  setName(name) {
    const trimmed = (name || '').trim();
    if (trimmed) {
      localStorage.setItem(NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(NAME_KEY);
    }
    console.log(`[PlayerConfig] Name set to: "${trimmed || '(empty)'}"`);
  },
};

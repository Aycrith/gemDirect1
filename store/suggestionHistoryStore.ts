type SuggestionHistoryState = {
  history: string[];
  add: (suggestions: string[]) => void;
  clear: () => void;
  has: (suggestion: string) => boolean;
};

const state: SuggestionHistoryState = {
  history: [],
  add: (suggestions: string[]) => {
    state.history = [...state.history, ...suggestions];
  },
  clear: () => {
    state.history = [];
  },
  has: (suggestion: string) => {
    const normalized = suggestion.trim().toLowerCase();
    return state.history.some(item => item.trim().toLowerCase() === normalized);
  },
};

export const suggestionHistoryStore = state;

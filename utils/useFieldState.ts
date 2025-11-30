import { useState } from 'react';

export type FieldState = 'Draft' | 'Validating' | 'HasIssues' | 'Converging' | 'Valid';

export const useFieldState = (initial: FieldState = 'Draft') => {
  const [state, setState] = useState<FieldState>(initial);

  return {
    state,
    setValidating: () => setState('Validating'),
    setHasIssues: () => setState('HasIssues'),
    setConverging: () => setState('Converging'),
    setValid: () => setState('Valid'),
    setDraft: () => setState('Draft'),
  };
};

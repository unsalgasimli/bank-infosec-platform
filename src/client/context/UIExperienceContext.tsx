import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type UIExperience = 'classic' | 'alive';

interface UIExperienceContextValue {
  experience: UIExperience;
  isAlive: boolean;
  setExperience: (experience: UIExperience) => void;
  toggleExperience: () => void;
}

const UIExperienceContext = createContext<UIExperienceContextValue | undefined>(undefined);

const STORAGE_KEY = 'aegis_ui_experience';

export const UIExperienceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [experience, setExperienceState] = useState<UIExperience>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'classic' || stored === 'alive') {
        return stored;
      }
      return 'alive'; // Default to Alive mode to showcase the experience
    } catch {
      return 'alive';
    }
  });

  const setExperience = useCallback((mode: UIExperience) => {
    setExperienceState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
    document.documentElement.setAttribute('data-ui-experience', mode);
  }, []);

  const toggleExperience = useCallback(() => {
    setExperience(experience === 'alive' ? 'classic' : 'alive');
  }, [experience, setExperience]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-experience', experience);
  }, [experience]);

  return (
    <UIExperienceContext.Provider
      value={{
        experience,
        isAlive: experience === 'alive',
        setExperience,
        toggleExperience,
      }}
    >
      {children}
    </UIExperienceContext.Provider>
  );
};

export const useUIExperience = (): UIExperienceContextValue => {
  const context = useContext(UIExperienceContext);
  if (!context) {
    throw new Error('useUIExperience must be used within a UIExperienceProvider');
  }
  return context;
};

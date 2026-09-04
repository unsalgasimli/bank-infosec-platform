import React from 'react';
import { Sparkles, Layers } from 'lucide-react';
import { useUIExperience } from '../../../context/UIExperienceContext.js';

interface AliveExperienceSwitcherProps {
  compact?: boolean;
  className?: string;
}

export const AliveExperienceSwitcher: React.FC<AliveExperienceSwitcherProps> = ({
  compact = false,
  className = '',
}) => {
  const { experience, setExperience } = useUIExperience();

  return (
    <div
      role="group"
      aria-label="Experience Switcher"
      className={`relative inline-flex items-center p-0.5 rounded-full border border-semantic-border-strong bg-semantic-subtle shadow-xs transition-colors ${className}`}
    >
      {/* Classic Button */}
      <button
        type="button"
        role="radio"
        aria-checked={experience === 'classic'}
        onClick={() => setExperience('classic')}
        title="Classic Mode (Standard banking interface)"
        className={`relative z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
          experience === 'classic'
            ? 'bg-semantic-panel text-semantic-primary shadow-xs font-bold'
            : 'text-semantic-muted hover:text-semantic-primary'
        }`}
      >
        <Layers className="w-3.5 h-3.5 opacity-80" />
        {!compact && <span>Classic</span>}
      </button>

      {/* Alive Button */}
      <button
        type="button"
        role="radio"
        aria-checked={experience === 'alive'}
        onClick={() => setExperience('alive')}
        title="Alive Mode (Kinetic, intelligent, action-oriented workspace)"
        className={`relative z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
          experience === 'alive'
            ? 'bg-gradient-to-r from-[#00F576] to-[#00DC6A] text-[#041407] shadow-[0_0_12px_rgba(0,245,118,0.35)] font-bold border border-[#00F576]/40'
            : 'text-semantic-muted hover:text-semantic-primary'
        }`}
      >
        <Sparkles className={`w-3.5 h-3.5 ${experience === 'alive' ? 'text-[#041407]' : 'opacity-80'}`} />
        {!compact && <span>Alive</span>}
      </button>
    </div>
  );
};

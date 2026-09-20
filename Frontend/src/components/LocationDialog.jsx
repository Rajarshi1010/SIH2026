import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function LocationDialog({ visible }) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-8 left-8 z-50 transition-all duration-300">
      <div className="glass-panel flex items-center gap-3 border border-accent px-4 py-3 text-[15px] text-text-primary">
        <AlertCircle className="h-5 w-5 shrink-0 text-accent" />
        <span>User location not available</span>
      </div>
    </div>
  );
}
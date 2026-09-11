import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function LocationDialog({ visible }) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-8 left-8 z-50 transition-all duration-300">
      <div className="glass-panel px-4 py-3 rounded-xl flex items-center gap-3 border border-amber-500/30 text-amber-200 text-sm shadow-2xl">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        <span>User location not available</span>
      </div>
    </div>
  );
}
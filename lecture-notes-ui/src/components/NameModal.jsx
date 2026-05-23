import React, { useState, useEffect } from 'react';
import { User, ArrowRight, X } from 'lucide-react';

const NameModal = ({ isOpen, onSubmit, onClose, initialName = '' }) => {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
      <div className="bg-cream rounded-2xl w-full max-w-md flex flex-col shadow-2xl border border-[#e6dac3] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="p-8 flex flex-col items-center text-center relative">
          {onClose && (
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700:text-gray-200 transition-colors"
            >
              <X size={20} />
            </button>
          )}
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6 shadow-inner">
            <User size={32} />
          </div>
          
          <h2 className="text-3xl font-serif font-bold text-gray-900 tracking-tight mb-2">
            {initialName ? "Edit Your Profile" : "Welcome to AI Notes"}
          </h2>
          <p className="text-sm text-gray-600 mb-8 leading-relaxed">
            {initialName 
              ? "Update your name below to personalize your dashboard." 
              : "Please enter your name to personalize your dashboard and get started."}
          </p>

          <form onSubmit={handleSubmit} className="w-full">
            <input 
              type="text" 
              placeholder="Your Name" 
              autoFocus
              className="w-full bg-white border border-[#e6dac3] rounded-xl px-4 py-3 text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-6 shadow-sm placeholder:text-gray-400 text-center text-lg transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            
            <button 
              type="submit"
              disabled={!name.trim()}
              className="w-full bg-gray-900 text-white rounded-xl px-4 py-3 font-bold hover:bg-gray-800:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            >
              Let's Go <ArrowRight size={18} />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default NameModal;

import React, { useState } from 'react';
import { X, Search as SearchIcon, Calendar, FileText, Trash2 } from 'lucide-react';

const SearchModal = ({ isOpen, onClose, sessions = [], onLoadTranscript, onDeleteSession }) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredNotes = sessions.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (note.rawTranscript && note.rawTranscript.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (note.preGeneratedNotes && note.preGeneratedNotes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] z-50 transition-opacity">
      <div className="bg-cream rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-[#e6dac3] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
        
        {/* Modal Header & Search Input */}
        <div className="p-4 border-b border-[#e6dac3] bg-white flex items-center gap-3">
          <div className="text-gray-400 pl-2">
            <SearchIcon size={24} />
          </div>
          <input 
            type="text"
            autoFocus
            placeholder="Search your notes, topics, or keywords..."
            className="flex-1 bg-transparent border-none text-xl font-medium text-gray-900 focus:outline-none focus:ring-0 placeholder:text-gray-300"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-full transition-colors ml-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content / List */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#fdfbf7]">
          {filteredNotes.length === 0 ? (
            <div className="py-12 text-center text-gray-400 font-medium">
              <FileText size={48} className="mx-auto mb-4 opacity-20" />
              <p>No results found for "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <div 
                  key={note.id} 
                  className="bg-white border border-[#e6dac3] rounded-xl p-4 hover:border-amber-400 hover:shadow-md transition-all group flex flex-col gap-2 cursor-pointer"
                  onClick={() => {
                    onLoadTranscript(note.rawTranscript, note.id);
                    onClose();
                  }}
                >
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-900 group-hover:text-amber-600 transition-colors">
                      {note.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <Calendar size={10} /> {new Date(note.date).toLocaleDateString()}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteSession(note.id); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 leading-relaxed truncate">
                    {note.rawTranscript && note.rawTranscript.substring(0, 150)}...
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t border-[#e6dac3] bg-gray-50 flex justify-between items-center text-xs font-semibold text-gray-400">
          <span>{filteredNotes.length} result{filteredNotes.length !== 1 && 's'}</span>
          <span>Searching saved sessions</span>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;

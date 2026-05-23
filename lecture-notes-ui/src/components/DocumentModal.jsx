import { X, FileText, Download, Trash2 } from 'lucide-react';

const DocumentModal = ({ isOpen, onClose, sessions = [], onLoadTranscript, onDeleteSession }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
      <div className="bg-cream rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-[#e6dac3] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#e6dac3] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <FileText size={20} />
            </div>
            <h2 className="text-2xl font-serif font-bold text-gray-900 tracking-tight">My Notes</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content / List */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#fdfbf7]">
          <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[60vh] pr-2">
            {sessions.map(note => (
              <div 
                key={note.id} 
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:border-accent hover:shadow-md transition-all cursor-pointer group"
                onClick={() => {
                  onLoadTranscript(note.rawTranscript, note.preGeneratedNotes, note.id);
                  onClose();
                }}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 group-hover:text-accent transition-colors">{note.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {new Date(note.date).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(note.id); }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Delete note"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-3">
                  <span className="flex items-center gap-1.5"><FileText size={14} /> {note.words} Words</span>
                  
                  {note.rawTranscript && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoadTranscript(note.rawTranscript, null, note.id);
                        onClose();
                      }}
                      className="ml-auto text-accent hover:text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    >
                      <Download size={12} /> Load Raw Transcript Only
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No notes saved yet. Start capturing to see them here!
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#e6dac3] bg-gray-50 text-center text-xs font-semibold text-gray-400">
          Viewing local mock data. Backend integration pending.
        </div>
      </div>
    </div>
  );
};

export default DocumentModal;

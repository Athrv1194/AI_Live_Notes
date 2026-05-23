import { X, Server, Clock, ArrowRight, Activity } from 'lucide-react';

const HistoryModal = ({ isOpen, onClose, sessions = [], onLoadTranscript }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
      <div className="bg-cream rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-[#e6dac3] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#e6dac3] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Server size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 tracking-tight">Session History</h2>
              <p className="text-xs text-gray-500 font-medium">Timeline of your past recordings</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content / Timeline List */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#fdfbf7]">
          {sessions.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No history available yet.
            </div>
          ) : (
            <div className="relative border-l-2 border-blue-200 ml-4 space-y-8">
              
              {sessions.map((session) => (
                <div key={session.id} className="relative pl-8 group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-blue-500 border-4 border-[#fdfbf7] group-hover:scale-125 transition-transform shadow-sm"></div>
                  
                  <div className="bg-white border border-[#e6dac3] rounded-xl p-5 hover:border-blue-400 hover:shadow-md transition-all shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                          {new Date(session.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                          {session.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            onLoadTranscript(session.rawTranscript, session.id);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-500 hover:text-white rounded-md text-xs font-bold transition-colors shadow-sm"
                        >
                          Load <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 font-medium">
                        <Clock size={16} className="text-gray-400" />
                        {session.duration}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 font-medium">
                        <Activity size={16} className="text-gray-400" />
                        {session.words} words
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;

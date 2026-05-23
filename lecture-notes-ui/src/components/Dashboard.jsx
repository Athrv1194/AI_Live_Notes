import { Clock, FileText, Activity, Search, Calendar, Trash2 } from 'lucide-react';

const Dashboard = ({ sessions = [], username = 'User', onDeleteSession }) => {
  // Compute Stats
  const totalSessions = sessions.length;
  
  // Calculate total duration in hours (assuming duration is "Xm Ys" or similar, we'll parse roughly or just show sessions count)
  // Since duration is tracked as "Xm Ys", let's parse it to minutes
  const totalMinutes = sessions.reduce((acc, curr) => {
    const minMatch = curr.duration.match(/(\d+)m/);
    if (minMatch) return acc + parseInt(minMatch[1], 10);
    return acc;
  }, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const totalWords = sessions.reduce((acc, curr) => acc + (curr.words || 0), 0);
  const avgWords = totalSessions > 0 ? Math.round(totalWords / totalSessions) : 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top Header */}
      <header className="h-[88px] px-8 flex items-center justify-between flex-shrink-0 bg-transparent border-b border-[#e6dac3] z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-serif font-bold text-gray-900 tracking-tight">Dashboard</h1>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8 pb-24">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Welcome Section */}
          <div>
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2 transition-colors">Welcome back, {username}</h2>
            <p className="text-gray-500 font-medium transition-colors">Here's a summary of your recent learning sessions.</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-[#e6dac3] border-b-4 border-b-amber-500 overflow-hidden">
              <div className="flex items-center gap-3 mb-4 text-amber-600">
                <FileText size={20} />
                <span className="text-xs font-bold tracking-widest uppercase">Total Sessions</span>
              </div>
              <span className="text-4xl font-serif font-bold text-gray-900">{totalSessions}</span>
            </div>
            
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-[#e6dac3] border-b-4 border-b-blue-500 overflow-hidden">
              <div className="flex items-center gap-3 mb-4 text-blue-600">
                <Clock size={20} />
                <span className="text-xs font-bold tracking-widest uppercase">Hours Recorded</span>
              </div>
              <span className="text-4xl font-serif font-bold text-gray-900 flex items-baseline">{totalHours}<span className="text-xl text-gray-500 ml-1">h</span></span>
            </div>

            <div className="bg-card rounded-2xl p-6 shadow-sm border border-[#e6dac3] border-b-4 border-b-emerald-500 overflow-hidden">
              <div className="flex items-center gap-3 mb-4 text-emerald-600">
                <Activity size={20} />
                <span className="text-xs font-bold tracking-widest uppercase">Avg Notes Length</span>
              </div>
              <span className="text-4xl font-serif font-bold text-gray-900 flex items-baseline">{avgWords}<span className="text-xl text-gray-500 ml-1">words</span></span>
            </div>
          </div>

          {/* Recent Sessions */}
          <div>
            <div className="flex justify-between items-center mb-6 mt-8">
              <h3 className="text-xl font-serif font-bold text-gray-900 transition-colors">Recent Sessions</h3>
              <button className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900:text-gray-200 transition-colors">
                <Search size={16} /> Search all
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.slice(0, 6).map(session => (
                <div key={session.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:border-accent:border-accent hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-gray-900 group-hover:text-accent:text-accent transition-colors">{session.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded flex items-center gap-1 transition-colors">
                        <Calendar size={12} /> {new Date(session.date).toLocaleDateString()}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Delete session"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 font-medium transition-colors">
                    <span className="flex items-center gap-1.5"><Clock size={14} /> {session.duration}</span>
                    <span className="flex items-center gap-1.5"><FileText size={14} /> {session.words} Words</span>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  No sessions recorded yet. Start a live capture to begin!
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;

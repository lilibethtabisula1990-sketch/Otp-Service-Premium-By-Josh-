import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Zap, 
  Smartphone, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Terminal,
  BarChart3,
  RefreshCw,
  Phone
} from 'lucide-react';

interface ServiceResult {
  serviceName: string;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
}

interface Stats {
  completed: number;
  successful: number;
  failed: number;
  total: number;
}

interface LogEntry {
  id: string;
  result: ServiceResult;
  timestamp: string;
}

export default function App() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [totalRequests, setTotalRequests] = useState(10);
  const [isTesting, setIsTesting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ completed: 0, successful: 0, failed: 0, total: 0 });
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banMessage, setBanMessage] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupType, setPopupType] = useState<'VIP' | 'OFFER' | 'SCRIPT' | 'SUPPORT'>('VIP');
  const [globalStats, setGlobalStats] = useState({ totalLikes: 0, totalUsers: 0 });
  const [hasLiked, setHasLiked] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppOpening, setIsAppOpening] = useState(true);
  const [showWeeklyAd, setShowWeeklyAd] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial App Loading Simulation
    const timer = setTimeout(() => {
      setIsAppOpening(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Weekly Ad Logic
    const lastShown = localStorage.getItem('lastWeeklyAdShown');
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    if (!lastShown || now - parseInt(lastShown) > oneWeek) {
      const timer = setTimeout(() => {
        setShowWeeklyAd(true);
        localStorage.setItem('lastWeeklyAdShown', now.toString());
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
      console.log('Connected to WebSocket');
      setWs(socket);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'PROGRESS') {
        setIsLoading(false);
        const { result, stats } = data.payload;
        setLogs(prev => [{
          id: Math.random().toString(36).substr(2, 9),
          result,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 50));
        setStats(stats);
      } else if (data.type === 'COMPLETE') {
        setIsTesting(false);
        setIsLoading(false);
        setCooldown(30);
      } else if (data.type === 'ERROR') {
        setIsLoading(false);
        alert(data.payload.message);
        setIsTesting(false);
      } else if (data.type === 'BANNED') {
        setIsLoading(false);
        setIsBanned(true);
        setBanMessage(data.payload.message);
        setIsTesting(false);
      } else if (data.type === 'GLOBAL_STATS') {
        setGlobalStats(data.payload);
      } else if (data.type === 'SESSION_INIT') {
        setSessionToken(data.payload.token);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      setPopupType('VIP');
      setShowPopup(true);
    }, 3000);

    const periodicTimer = setInterval(() => {
      const types: ('VIP' | 'OFFER' | 'SCRIPT' | 'SUPPORT')[] = ['VIP', 'OFFER', 'SCRIPT', 'SUPPORT'];
      const randomType = types[Math.floor(Math.random() * types.length)];
      setPopupType(randomType);
      setShowPopup(true);
    }, 45000); // Show a popup every 45 seconds

    return () => {
      clearTimeout(initialTimer);
      clearInterval(periodicTimer);
    };
  }, []);

  const startTest = () => {
    if (!phoneNumber || !ws || cooldown > 0 || !sessionToken) return;
    const count = Math.min(totalRequests, 50);
    setLogs([]);
    setStats({ completed: 0, successful: 0, failed: 0, total: count });
    setIsTesting(true);
    setIsLoading(true);
    ws.send(JSON.stringify({
      type: 'START_TEST',
      payload: { 
        phoneNumber, 
        totalRequests: count,
        token: sessionToken
      }
    }));
  };

  const progressPercentage = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  const handleLike = () => {
    if (hasLiked || !ws) return;
    setHasLiked(true);
    ws.send(JSON.stringify({ type: 'LIKE' }));
  };

  if (isBanned) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md bg-[#151619] border border-red-500/30 rounded-3xl p-12 shadow-[0_0_50px_rgba(239,68,68,0.1)]"
        >
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4 uppercase tracking-tighter">Access Terminated</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-8">{banMessage}</p>
          <div className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">
            IP_BAN_STATUS: PERMANENT
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-100 font-sans selection:bg-orange-500/30">
      {/* App Opening Loading System */}
      <AnimatePresence>
        {isAppOpening && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="relative mb-12"
            >
              <div className="w-32 h-32 border-4 border-orange-500/10 rounded-full animate-spin border-t-orange-500" />
              <Zap className="w-12 h-12 text-orange-500 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 animate-pulse" />
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <h1 className="text-3xl font-black text-white uppercase tracking-[0.5em] italic mb-2">
                JOSH <span className="text-orange-500">PREMIUM</span>
              </h1>
              <p className="text-gray-500 text-[10px] uppercase tracking-[0.3em] font-mono">
                Establishing Secure Connection...
              </p>
            </motion.div>

            <div className="absolute bottom-12 w-48 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="h-full bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permanent Channel Announcement Sticky Bar */}
      <div className="bg-orange-500 text-black py-2 px-6 sticky top-0 z-[60] shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-hidden">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <Activity className="w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              JEFF OFFICIAL CHANNEL: Join Now Our Official Channel And To Be Notified On Up Comming Update
            </span>
          </div>
          <a 
            href="https://t.me/txtfilegenerator"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-black text-white text-[9px] font-bold px-4 py-1 rounded-full uppercase tracking-widest hover:scale-105 transition-transform shrink-0"
          >
            Join Now
          </a>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-10 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-lg font-bold tracking-tight uppercase italic font-mono">
              Josh SMS <span className="text-orange-500">Premium</span>
            </h1>
          </div>
          <div className="flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {globalStats.totalUsers.toLocaleString()} Users Online
            </div>
            <div className="hidden sm:block">v2.4.0-stable</div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls & Stats */}
        <div className="lg:col-span-4 space-y-8">
          {/* Control Panel */}
          <section className="bg-[#151619] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-4 h-4 text-orange-500" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Control Unit</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-bold">Target Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input 
                    type="text" 
                    placeholder="09123456789"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isTesting}
                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors disabled:opacity-50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-bold">Request Count (Max 50)</label>
                <input 
                  type="number" 
                  min="1"
                  max="50"
                  value={totalRequests}
                  onChange={(e) => setTotalRequests(Math.min(parseInt(e.target.value) || 1, 50))}
                  disabled={isTesting || cooldown > 0}
                  className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors disabled:opacity-50 font-mono"
                />
              </div>

              <button 
                onClick={startTest}
                disabled={isTesting || !phoneNumber || cooldown > 0}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 group overflow-hidden relative"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                    <span>Cooldown: {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
                    <span>Initiate Bombardment</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Real-time Analytics */}
          <section className="bg-[#151619] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-4 h-4 text-orange-500" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Analytics</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Success</div>
                <div className="text-2xl font-mono text-green-500">{stats.successful}</div>
              </div>
              <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Failed</div>
                <div className="text-2xl font-mono text-red-500">{stats.failed}</div>
              </div>
              <div className="bg-black/40 border border-white/5 rounded-xl p-4 col-span-2">
                <div className="flex justify-between items-end mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Progress</div>
                  <div className="text-sm font-mono">{stats.completed} / {stats.total}</div>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Global Stats & Like Button */}
          <section className="bg-[#151619] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-orange-500" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Global Activity</h2>
              </div>
              <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                Real-time
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl p-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Total Users</div>
                  <div className="text-xl font-mono text-white">{globalStats.totalUsers.toLocaleString()}</div>
                </div>
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl p-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">System Likes</div>
                  <div className="text-xl font-mono text-white">{globalStats.totalLikes.toLocaleString()}</div>
                </div>
                <button 
                  onClick={handleLike}
                  disabled={hasLiked}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    hasLiked 
                    ? 'bg-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.4)]' 
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-orange-500'
                  }`}
                >
                  <motion.div
                    whileTap={{ scale: 0.8 }}
                    animate={hasLiked ? { scale: [1, 1.2, 1] } : {}}
                  >
                    <CheckCircle2 className={`w-5 h-5 ${hasLiked ? 'fill-current' : ''}`} />
                  </motion.div>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Terminal Logs */}
        <div className="lg:col-span-8">
          <section className="bg-[#151619] border border-white/5 rounded-2xl h-[600px] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-black/40 border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-orange-500" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">System Logs</h2>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-2 custom-scrollbar">
              <AnimatePresence initial={false}>
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50 space-y-4">
                    <Activity className="w-12 h-12 stroke-1" />
                    <p className="uppercase tracking-[0.2em] text-[10px]">Awaiting Instructions...</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <motion.div 
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-4 py-1 border-b border-white/[0.02]"
                    >
                      <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                      <span className="text-orange-500/80 shrink-0">TEST_UNIT:</span>
                      <span className="text-gray-300 shrink-0 w-32">{log.result.serviceName}</span>
                      <span className="flex-1">
                        {log.result.success ? (
                          <span className="text-green-500 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3" />
                            SUCCESS (CODE: {log.result.statusCode})
                          </span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-2">
                            <XCircle className="w-3 h-3" />
                            FAILED {log.result.statusCode ? `(CODE: ${log.result.statusCode})` : ''}
                          </span>
                        )}
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={logEndRef} />
            </div>

            <div className="bg-black/40 border-t border-white/5 px-6 py-3 text-[10px] text-gray-600 font-mono flex justify-between uppercase tracking-widest">
              <span>Status: {isTesting ? 'Active' : 'Idle'}</span>
              <span>Worker Threads: 8</span>
            </div>
          </section>

          {/* Fake Ad / Promotion */}
          <motion.a 
            href="https://t.me/txtfilegenerator"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 block group"
          >
            <div className="bg-gradient-to-r from-orange-500/10 to-transparent border border-orange-500/20 rounded-2xl p-6 flex items-center justify-between hover:border-orange-500/40 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Smartphone className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">Join TXT File Generator</h3>
                  <p className="text-xs text-gray-500">Premium scripts and tools for professional testers.</p>
                </div>
              </div>
              <div className="bg-orange-500 text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                Join Now
              </div>
            </div>
          </motion.a>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-gray-500 text-[10px] uppercase tracking-widest max-w-md text-center md:text-left leading-relaxed">
            This tool is intended for professional security testing and service integration validation. 
            Unauthorized use for harassment is strictly prohibited.
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-gray-500 hover:text-orange-500 text-[10px] uppercase tracking-widest transition-colors font-bold">Documentation</a>
            <a href="#" className="text-gray-500 hover:text-orange-500 text-[10px] uppercase tracking-widest transition-colors font-bold">API Status</a>
            <a href="#" className="text-gray-500 hover:text-orange-500 text-[10px] uppercase tracking-widest transition-colors font-bold">Support</a>
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(249, 115, 22, 0.2);
        }
      `}} />

      {/* Loading System Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <div className="relative">
              <div className="w-24 h-24 border-4 border-orange-500/20 rounded-full animate-spin border-t-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.2)]" />
              <Zap className="w-8 h-8 text-orange-500 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 animate-pulse" />
            </div>
            <h2 className="mt-8 text-xl font-bold text-white uppercase tracking-[0.3em] animate-pulse italic font-mono">
              Initializing <span className="text-orange-500">Bombardment</span>
            </h2>
            <div className="mt-4 flex gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weekly Ad Modal */}
      <AnimatePresence>
        {showWeeklyAd && !isBanned && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, rotateX: 45 }}
              animate={{ scale: 1, opacity: 1, rotateX: 0 }}
              exit={{ scale: 0.8, opacity: 0, rotateX: 45 }}
              className="max-w-md w-full bg-[#151619] border-2 border-orange-500 rounded-[2rem] p-10 shadow-[0_0_100px_rgba(249,115,22,0.3)] relative overflow-hidden"
            >
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />
              
              <button 
                onClick={() => setShowWeeklyAd(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors z-10"
              >
                <XCircle className="w-8 h-8" />
              </button>

              <div className="text-center relative z-10">
                <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(249,115,22,0.5)] rotate-12">
                  <Zap className="w-10 h-10 text-black fill-current" />
                </div>
                
                <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-tighter italic">
                  ADS! <span className="text-orange-500">JOIN NOW</span>
                </h2>
                
                <p className="text-gray-400 text-base leading-relaxed mb-10 font-medium">
                  Don't miss out on our exclusive weekly updates and premium tools. Join the elite community today.
                </p>

                <a 
                  href="https://t.me/+T1ER2iGB0qZmMTJl"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowWeeklyAd(false)}
                  className="block w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-5 rounded-2xl transition-all uppercase tracking-[0.2em] text-sm shadow-[0_10px_20px_rgba(249,115,22,0.3)] hover:translate-y-[-2px] active:translate-y-[0px]"
                >
                  JOIN NOW
                </a>
                
                <div className="mt-6 text-[10px] text-gray-600 uppercase tracking-widest font-mono">
                  Weekly Exclusive Offer
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fake Popup Ad */}
      <AnimatePresence>
        {showPopup && !isBanned && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="max-w-md w-full bg-[#151619] border border-orange-500/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(249,115,22,0.2)] relative"
            >
              <button 
                onClick={() => setShowPopup(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>

              <div className="text-center">
                <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  {popupType === 'VIP' && <Zap className="w-8 h-8 text-orange-500 fill-current" />}
                  {popupType === 'OFFER' && <Activity className="w-8 h-8 text-orange-500" />}
                  {popupType === 'SCRIPT' && <Terminal className="w-8 h-8 text-orange-500" />}
                  {popupType === 'SUPPORT' && <Shield className="w-8 h-8 text-orange-500" />}
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-tighter italic">
                  {popupType === 'VIP' && <>Unlock <span className="text-orange-500">Premium</span> Access</>}
                  {popupType === 'OFFER' && <>Limited <span className="text-orange-500">Time</span> Offer</>}
                  {popupType === 'SCRIPT' && <>New <span className="text-orange-500">Script</span> Alert</>}
                  {popupType === 'SUPPORT' && <>Support <span className="text-orange-500">Developer</span></>}
                </h2>
                
                <p className="text-gray-400 text-sm leading-relaxed mb-8">
                  {popupType === 'VIP' && "Get exclusive access to private scripts, advanced SMS testing tools, and early updates. Join our official Telegram community now."}
                  {popupType === 'OFFER' && "Get 50% discount on VIP access for the next 24 hours. Don't miss out on this exclusive deal for our Telegram members."}
                  {popupType === 'SCRIPT' && "A new SMS stress testing script has just been released! Check it out in our Telegram channel before it goes public."}
                  {popupType === 'SUPPORT' && "Enjoying the tool? Support the developer by joining our Telegram channel and sharing it with your friends."}
                </p>

                <div className="space-y-3">
                  <a 
                    href="https://t.me/txtfilegenerator"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-xs"
                  >
                    Join Telegram Channel
                  </a>
                  <button 
                    onClick={() => setShowPopup(false)}
                    className="block w-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-[10px]"
                  >
                    Maybe Later
                  </button>
                </div>

                <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {globalStats.totalUsers.toLocaleString()} Users Online
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

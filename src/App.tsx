/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Settings, 
  Droplets, 
  Camera, 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  RefreshCcw,
  Thermometer,
  CloudRain,
  BrainCircuit,
  Zap,
  Leaf
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { initializeApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, query, orderBy, limit, onSnapshot, doc, getDocFromServer } from 'firebase/firestore';

// Initialize Firebase Client
const configs = (import.meta as any).glob('../firebase-applet-config.json', { eager: true, import: 'default' });
const firebaseConfig = configs['../firebase-applet-config.json'] || {};

const config = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
};

const app = initializeApp(config);
const databaseId = (import.meta as any).env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';
const clientDb = getClientFirestore(app, databaseId);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Constants for health mapping
const MOISTURE_THRESHOLDS = {
  CRITICAL_LOW: 20,
  OPTIMAL_MIN: 40,
  OPTIMAL_MAX: 70,
  CRITICAL_HIGH: 90
};

interface SensorReading {
  timestamp: number;
  moisture: number;
}

export default function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remoteImage, setRemoteImage] = useState<string | null>(null);
  const [remoteImageId, setRemoteImageId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const lastAnalyzedRef = useRef<number | null>(null);

  // Connection health check for Firestore
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(clientDb, 'snapshots', 'ping'));
      } catch (err: any) {
        if (err.message.includes('permission-denied')) {
          console.warn("Firestore access restricted by rules (expected if 'ping' doesn't exist).");
        }
      }
    };
    testConnection();
  }, []);

  // Real-time history listener
  useEffect(() => {
    const q = query(collection(clientDb, 'snapshots'), orderBy('timestamp', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setHistory(data);

      if (data.length > 0) {
        const latest = data[0];
        
        // Use a functional update or closure-safe check? 
        // We need to know if this is a NEW uplink compared to what we have in STATE.
        setLastUpdated(prev => {
          if (!prev || latest.timestamp > prev) {
            // It's a brand new upload!
            setRemoteImage(latest.image);
            setRemoteImageId(latest.id);
            // Clear current analysis so the analyzer triggers for the new image
            setHealthScore(latest.score ?? null);
            setAiReport(latest.analysis ?? null);
            return latest.timestamp;
          } else if (latest.timestamp === prev) {
            // It's an update to the CURRENT snapshot (e.g. analysis results saved to DB)
            if (latest.score !== undefined) setHealthScore(latest.score);
            if (latest.analysis !== undefined) setAiReport(latest.analysis);
            return prev;
          }
          return prev;
        });
      }
    }, (err) => {
      console.error("Firestore history listener error:", err);
    });
    return () => unsubscribe();
  }, []);

  const fetchLatestImage = async () => {
    try {
      const res = await fetch('/api/latest-image');
      if (res.ok) {
        const data = await res.json();
        setRemoteImage(data.image);
        setRemoteImageId(data.id);
        setLastUpdated(data.timestamp);
        if (data.score !== undefined) setHealthScore(data.score);
        if (data.analysis !== undefined) setAiReport(data.analysis);
      }
    } catch (err) {
      // Background fetch failure is fine
    }
  };

  useEffect(() => {
    fetchLatestImage();
    const interval = setInterval(() => {
      fetchLatestImage();
    }, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const analyzePlant = async (image: string, docId: string | null) => {
    setIsAnalyzing(true);
    setError(null);
    // Don't clear aiReport here immediately, as we might already have it from the snapshot
    // But if we're explicitly starting a fresh analysis (aiReport is null), that's fine.

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              data: image,
              mimeType: "image/jpeg",
            },
          },
          {
            // text: `You are an expert botanist. Analyze this plant from the snapshot provided by the IoT station. 
            // Assess overall health (leaf color, texture, shape). 
            // Provide a health score from 0 to 100 where 100 is perfectly healthy.
            // Format your response as a JSON object with two keys: "score" (number) and "analysis" (markdown string).
            // Identify the plant if possible. Focus strictly on visual health assessment and identifying pests/disease. Do NOT provide care advice.`,
            text: `You are an expert botanist. Analyze this plant from the snapshot provided by the IoT station. 
            Assess overall health (leaf color, texture, shape). 
            Provide a health score from 0 to 100 where 100 is perfectly healthy.
            Format your response as a JSON object with two keys: "score" (number) and "analysis" (markdown string).
            Identify the plant if possible. Focus strictly on visual health assessment and identifying pests/disease. Do NOT provide care advice.
            You are addressing a woman in her late 20s with this analysis, she owns the plant. Use some genz language, e.g. clock, low key, girl, rogue, 
            slay, girlboss. These words are a guide, you can use a couple in the response but dont overdo it on the lanaguage side.
            Still provide a detailed analysis.`,
          },
        ],
      });

      const text = response.text || "";
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        setHealthScore(data.score);
        setAiReport(data.analysis);

        // Persist the analysis onto the existing snapshot doc (not a new one)
        await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: docId,
            image,
            secret: (import.meta as any).env.VITE_UPLOAD_SECRET || "Caroline", // Fallback for demo
            score: data.score,
            analysis: data.analysis
          })
        });
      } catch (e) {
        setAiReport(text);
        setHealthScore(null);
      }
    } catch (err: any) {
      setError(err.message || "AI Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Trigger analysis when a new image is detected that HAS NO analysis yet
  useEffect(() => {
    if (remoteImage && lastUpdated && lastUpdated !== lastAnalyzedRef.current) {
      // If the incoming snapshot doesn't have a report, we trigger AI
      if (!aiReport && !isAnalyzing) {
        lastAnalyzedRef.current = lastUpdated;
        analyzePlant(remoteImage, remoteImageId);
      } else if (aiReport) {
        // If snapshot ALREADY had a report, we just record that we've seen this one
        lastAnalyzedRef.current = lastUpdated;
      }
    }
  }, [remoteImage, remoteImageId, lastUpdated, aiReport, isAnalyzing]);

  return (
    <div className="min-h-screen bg-[#A3C077] text-[#173404] font-sans selection:bg-accent-green selection:text-white flex flex-col p-6 md:p-10 overflow-y-auto">
      {/* Top Navigation / Status Header */}
      <header className="relative z-10 flex justify-between items-start mb-8 w-full shrink-0 bg-white p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Leaf className="text-accent-green" size={24} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#173404]">
              Plant Analysis Tool
            </h1>
            <p className="text-[11px] text-accent-green font-mono uppercase tracking-[2px] mt-0.5">
              {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Awaiting new photo...'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-accent-green/10 border border-accent-green/20 rounded-full text-[10px] uppercase tracking-wider text-accent-green">
            <div className={`w-1.5 h-1.5 bg-accent-green rounded-full ${isAnalyzing ? 'animate-ping' : 'animate-pulse'} shadow-[0_0_8px_currentColor]`} />
            {isAnalyzing ? 'Analysing Morphology...' : 'Plant Monitor Active'}
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
        {/* Left Column: Visual Viewport */}
        <section className="flex flex-col gap-6 min-h-0 min-w-0 items-center justify-start">
          <div className="relative w-full aspect-[3/4] lg:aspect-square bg-white rounded-[32px] border border-glass-border overflow-hidden shadow-sm flex items-center justify-center mt-2">
            {remoteImage ? (
              <img
                src={`data:image/jpeg;base64,${remoteImage}`}
                className="w-full h-full object-cover"
                alt="Latest Plant Snapshot"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#173404]/30 bg-gradient-to-br from-[#EAF3DE] to-[#C0DD97]">
                <Camera size={64} strokeWidth={1} />
                <span className="mt-4 uppercase tracking-[0.2em] text-sm font-light">Waiting for new photo...</span>
              </div>
            )}

            {/* Visual Overlays */}
            <div className="absolute inset-0 pointer-events-none border-[12px] border-black/10" />

            {/* Overlay Metadata */}
            <div className="absolute bottom-6 left-6 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-mono text-white/90 shadow-xl">
                CAM_01 // SOURCE: Windows webcam
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Diagnostics (Sidebar) */}
        <aside className="flex flex-col gap-6">
          {/* Health Score Card */}
          <div className="glass-card">
            <p className="text-sm font-medium text-text-dim mb-4">Health Score</p>
            <div className="flex items-center gap-8">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="56"
                    cy="56"
                    r="48"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="transparent"
                    className="text-black/5"
                  />
                  <motion.circle
                    cx="56"
                    cy="56"
                    r="48"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray={301.6}
                    initial={{ strokeDashoffset: 301.6 }}
                    animate={{ strokeDashoffset: 301.6 - (301.6 * (healthScore || 0)) / 100 }}
                    className="text-accent-green"
                  />
                </svg>
                <span className="absolute text-3xl font-light">{healthScore || '--'}</span>
              </div>
              <div className="space-y-1">
                <p className={`text-lg font-medium ${healthScore && healthScore > 70 ? 'text-accent-green' : 'text-orange-400'}`}>
                  {healthScore ? (healthScore > 80 ? 'Glow Up Era' : healthScore > 60 ? 'Its vibing' : 'Struggling fr') : 'Analysis Pending'}
                </p>
                <p className="text-xs text-text-dim leading-relaxed max-w-[200px]">
                  Visual assessment of morphology, color balance, and leaf texture.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card flex flex-col min-h-[400px] lg:flex-1">
            <div className="flex items-center justify-between mb-6 border-b border-black/5 pb-4">
              <p className="text-sm font-medium text-text-dim">Plant Analysis</p>
              <Zap size={14} className={isAnalyzing ? "text-accent-green animate-pulse" : "text-accent-green opacity-30"} />
            </div>
            
            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div 
                    key="analyzing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6 pt-4"
                  >
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-6 bg-black/5 animate-pulse rounded w-full" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </motion.div>
                ) : aiReport ? (
                  <motion.div 
                    key="report"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl prose prose-xl max-w-none text-[#173404]/90 prose-p:leading-relaxed prose-p:my-6 prose-strong:text-accent-green prose-strong:font-bold prose-headings:text-[#173404] prose-headings:font-light prose-headings:tracking-tight border-l-4 border-accent-green/40 pl-8 py-2"
                  >
                    <ReactMarkdown>{aiReport}</ReactMarkdown>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-black/5 rounded-2xl border border-black/5"
                  >
                    <p className="text-xs font-light text-text-dim leading-relaxed text-center">
                      Ready for the next photo.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </main>

      {/* History Section */}
      <section className="mt-12 w-full">
        <h2 className="text-sm font-medium text-text-dim mb-6 flex items-center gap-2">
          <Activity size={12} className="text-accent-green" />
          Snapshot History (Last 10)
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {history.length > 0 ? history.map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card !p-3 group cursor-pointer hover:border-accent-green/30 transition-colors"
              onClick={() => {
                setRemoteImage(item.image);
                setLastUpdated(item.timestamp);
                setHealthScore(item.score);
                setAiReport(item.analysis);
              }}
            >
              <div className="relative aspect-square rounded-2xl overflow-hidden mb-3">
                <img 
                  src={`data:image/jpeg;base64,${item.image}`} 
                  className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                  alt={`History ${idx}`}
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors" />
              </div>
              <p className="text-[10px] font-mono text-text-dim group-hover:text-accent-green transition-colors">
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[9px] text-black/30 mt-0.5">
                {new Date(item.timestamp).toLocaleDateString()}
              </p>
            </motion.div>
          )) : (
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <div key={i} className="glass-card !p-3 animate-pulse">
                <div className="aspect-square bg-black/5 rounded-2xl mb-3" />
                <div className="h-2 bg-black/5 rounded w-1/2" />
              </div>
            ))
          )}
        </div>
      </section>

      <style>{`
        .glass-card {
          border-radius: 32px;
          padding: 24px;
          box-shadow: 0 4px 16px 0 rgba(23, 52, 4, 0.08);
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(23, 52, 4, 0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(39, 80, 10, 0.4); }
      `}</style>

      {/* Global Alerts */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-10 p-4 border border-alert-red bg-white rounded-2xl flex items-center gap-3 text-alert-red font-medium text-xs z-50 uppercase tracking-widest shadow-md"
          >
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100 px-2 leading-none">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

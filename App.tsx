
import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { jsPDF } from "jspdf";
import { 
  UserRole, 
  ApplicationStatus, 
  GatePassApplication, 
  User 
} from './types';
import { 
  LogIn, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Download, 
  Clock, 
  ChevronLeft,
  ShieldCheck,
  UserCheck,
  Home,
  MapPin,
  Search,
  ExternalLink,
  Loader2,
  Navigation,
  AlertCircle,
  AlertTriangle,
  QrCode,
  Timer
} from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<'splash' | 'role-select' | 'login' | 'signup' | 'dashboard' | 'apply' | 'details'>('splash');
  const [role, setRole] = useState<UserRole | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Persistence: Initial state from localStorage
  const [applications, setApplications] = useState<GatePassApplication[]>(() => {
    const saved = localStorage.getItem('rgipt_gatepasses_db');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedApp, setSelectedApp] = useState<GatePassApplication | null>(null);

  // Form & Interaction states
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{title: string, uri: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // Authority Decline State
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReasonInput, setDeclineReasonInput] = useState('');

  // Live Clock Effect
  useEffect(() => {
    const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  // Save to persistence whenever applications update
  useEffect(() => {
    localStorage.setItem('rgipt_gatepasses_db', JSON.stringify(applications));
  }, [applications]);

  // Splash screen transition
  useEffect(() => {
    const timer = setTimeout(() => {
      setView('role-select');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const detectLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => {
          setUserLocation({ latitude: 26.2494, longitude: 81.3913 });
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhoneInput(val);
  };

  const fetchPlaceSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2 || isQuotaExceeded) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    setApiError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let latLng = userLocation || { latitude: 26.2494, longitude: 81.3913 };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `I am at RGIPT, Jais. I am applying for a gate pass to: "${query}". Provide 5 matching local locations in India. Use Google Maps tool.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: { latLng }
          }
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const mapsResults = chunks
        .filter(chunk => chunk.maps)
        .map(chunk => ({
          title: chunk.maps?.title || "Suggested Place",
          uri: chunk.maps?.uri || ""
        }));

      if (mapsResults.length === 0 && response.text) {
          const lines = response.text.split('\n').filter(l => l.trim() !== '').slice(0, 5);
          setSuggestions(lines.map(l => ({ title: l.replace(/^\d+\.\s*/, '').trim(), uri: '' })));
      } else {
          setSuggestions(mapsResults);
      }
    } catch (err: any) {
      console.error("API Error caught:", err);
      const errStr = JSON.stringify(err);
      
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || (err.message && (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED")))) {
        setIsQuotaExceeded(true);
        setApiError("Search limit reached. Please type destination manually.");
      } else {
        setApiError("Search currently unavailable. Manual entry enabled.");
      }
    } finally {
      setIsSearching(false);
    }
  }, [userLocation, isQuotaExceeded]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (view === 'apply' && placeQuery.length >= 2 && !isQuotaExceeded) {
        fetchPlaceSuggestions(placeQuery);
      }
    }, 800);
    return () => clearTimeout(delayDebounceFn);
  }, [placeQuery, fetchPlaceSuggestions, view, isQuotaExceeded]);

  const generateGatePassNumber = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleApply = (formData: Omit<GatePassApplication, 'id' | 'status' | 'submittedAt'>) => {
    const newApp: GatePassApplication = {
      ...formData,
      id: `GP-${Date.now()}`,
      status: ApplicationStatus.PENDING,
      submittedAt: new Date().toISOString(),
    };
    setApplications(prev => [newApp, ...prev]);
    setPlaceQuery('');
    setSuggestions([]);
    setView('dashboard');
  };

  const handleApprove = (id: string) => {
    setApplications(prev => prev.map(app => 
      app.id === id 
        ? { ...app, status: ApplicationStatus.APPROVED, gatePassNumber: generateGatePassNumber() } 
        : app
    ));
    setView('dashboard');
    if (selectedApp?.id === id) {
      setSelectedApp(prev => prev ? { ...prev, status: ApplicationStatus.APPROVED, gatePassNumber: generateGatePassNumber() } : null);
    }
  };

  const finalizeDecline = (id: string) => {
    if (!declineReasonInput.trim()) {
      alert("A reason is mandatory to decline an application.");
      return;
    }
    
    setApplications(prev => prev.map(app => 
      app.id === id ? { ...app, status: ApplicationStatus.DECLINED, declineReason: declineReasonInput } : app
    ));
    setIsDeclining(false);
    setDeclineReasonInput('');
    setView('dashboard');
    if (selectedApp?.id === id) {
      setSelectedApp(prev => prev ? { ...prev, status: ApplicationStatus.DECLINED, declineReason: declineReasonInput } : null);
    }
  };

  const handleSecurityAction = (id: string, action: 'out' | 'in') => {
    const now = new Date().toLocaleString('en-IN', { 
      day: 'numeric', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
    });
    
    setApplications(prev => prev.map(app => {
      if (app.id === id) {
        const updated = action === 'out' ? { ...app, outTime: now } : { ...app, inTime: now };
        if (selectedApp?.id === id) setSelectedApp(updated);
        return updated;
      }
      return app;
    }));
  };

  const downloadPassPDF = (app: GatePassApplication) => {
    const doc = new jsPDF();
    const primaryColor = [0, 33, 71]; 
    const accentColor = [34, 197, 94]; 
    const grayColor = [100, 100, 100];

    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 50, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RAJIV GANDHI INSTITUTE OF PETROLEUM TECHNOLOGY", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("An Institution of National Importance, Jais, Amethi - 229304", 105, 28, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DIGITAL GATE PASS CERTIFICATE", 105, 42, { align: "center" });

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.rect(10, 55, 190, 220);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(11);
    doc.text("GATE PASS IDENTIFIER:", 20, 75);
    doc.setFontSize(28);
    doc.setFont("courier", "bold");
    doc.text(app.gatePassNumber || "N/A", 20, 88);

    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(2);
    doc.roundedRect(145, 65, 45, 25, 3, 3);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("APPROVED", 167.5, 78, { align: "center" });
    doc.setFontSize(8);
    doc.text("DIGITALLY SIGNED", 167.5, 85, { align: "center" });

    doc.setDrawColor(240, 240, 240);
    doc.line(20, 100, 190, 100);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    
    const leftX = 20;
    let currentY = 115;
    const verticalGap = 12;

    const infoFields = [
      { label: "Student Name", value: app.studentName },
      { label: "Roll Number", value: app.rollNumber },
      { label: "Academic Program", value: app.program },
      { label: "Current Year", value: `${app.year} Year` },
      { label: "Phone Number", value: `+91 ${app.contactNumber}` },
      { label: "Final Destination", value: app.place },
      { label: "Stated Purpose", value: app.purpose },
    ];

    infoFields.forEach((field) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(field.label.toUpperCase() + ":", leftX, currentY);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(String(field.value), leftX + 45, currentY);
      
      currentY += verticalGap;
    });

    currentY += 10;
    doc.setFillColor(248, 250, 252);
    doc.rect(20, currentY - 5, 170, 35, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("OFFICIAL TRAVEL SCHEDULE", 105, currentY + 5, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("DEPARTURE FROM CAMPUS:", 30, currentY + 18);
    doc.setFont("helvetica", "normal");
    doc.text(`${app.departureDate} at ${app.departureTime}`, 30, currentY + 23);

    doc.setFont("helvetica", "bold");
    doc.text("EXPECTED RETURN BY:", 120, currentY + 18);
    doc.setFont("helvetica", "normal");
    doc.text(`${app.arrivalDate} at ${app.arrivalTime}`, 120, currentY + 23);

    currentY += 50;
    doc.setDrawColor(255, 200, 0);
    doc.setLineWidth(0.5);
    doc.line(20, currentY, 190, currentY);
    
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("SECURITY INSTRUCTIONS:", 20, currentY + 8);
    doc.text("1. Student must carry original RGIPT ID Card at all times.", 20, currentY + 14);
    doc.text("2. Present this PDF on mobile or physical copy to Gate Security for QR/ID verification.", 20, currentY + 19);
    doc.text("3. Violation of return timing may lead to disciplinary action.", 20, currentY + 24);

    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 280, 210, 17, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text("© Rajiv Gandhi Institute of Petroleum Technology - Digital Governance Cell", 105, 287, { align: "center" });
    doc.text("Verify this pass at: gatepass.rgipt.ac.in | Timestamp: " + new Date().toLocaleString(), 105, 292, { align: "center" });

    doc.save(`RGIPT_GATEPASS_${app.gatePassNumber}.pdf`);
  };

  const resetToMain = () => {
    setRole(null);
    setCurrentUser(null);
    setPhoneInput('');
    setPasswordInput('');
    setPlaceQuery('');
    setSuggestions([]);
    setApiError(null);
    setSelectedApp(null);
    setIsQuotaExceeded(false);
    setIsDeclining(false);
    setView('role-select');
  };

  if (view === 'splash') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-center p-4">
        <div className="w-48 h-48 mb-6 flex items-center justify-center animate-pulse">
           <img src="https://placehold.co/200x200?text=RGIPT+Logo" alt="RGIPT Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl font-bold text-[#002147] mb-2 tracking-tight">Rajiv Gandhi Institute of Petroleum Technology</h1>
        <p className="text-gray-400 tracking-[0.3em] uppercase text-[10px] font-black">Digital Gate Pass Ecosystem</p>
      </div>
    );
  }

  if (view === 'role-select') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6 justify-center">
        <header className="w-full max-w-md flex flex-col items-center mb-10 text-center">
          <div className="p-5 bg-[#002147] rounded-[2rem] mb-6 shadow-2xl">
            <ShieldCheck size={48} className="text-white" />
          </div>
          <h2 className="text-4xl font-black text-[#002147] tracking-tighter">Campus Access</h2>
          <p className="text-gray-500 text-sm mt-3 font-medium">Select your role to continue</p>
        </header>

        <div className="grid gap-4 w-full max-w-md">
          <button onClick={() => { setRole('student'); setView('login'); }} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-transparent hover:border-blue-500 transition-all group active:scale-95">
            <div className="bg-blue-50 p-4 rounded-2xl group-hover:bg-blue-600 transition-colors">
              <UserCheck className="text-blue-600 group-hover:text-white w-6 h-6" />
            </div>
            <div className="ml-5 text-left">
              <h3 className="font-black text-gray-900 text-lg">Student Login</h3>
              <p className="text-xs text-gray-500 font-medium">Apply and track your gate pass status</p>
            </div>
          </button>
          <button onClick={() => { setRole('authority'); setView('login'); }} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-transparent hover:border-indigo-500 transition-all group active:scale-95">
            <div className="bg-indigo-50 p-4 rounded-2xl group-hover:bg-indigo-600 transition-colors">
              <ShieldCheck className="text-indigo-600 group-hover:text-white w-6 h-6" />
            </div>
            <div className="ml-5 text-left">
              <h3 className="font-black text-gray-900 text-lg">Authority Login</h3>
              <p className="text-xs text-gray-500 font-medium">Manage pending leave requests</p>
            </div>
          </button>
          <button onClick={() => { setRole('security'); setView('login'); }} className="flex items-center p-6 bg-white rounded-3xl shadow-sm border border-transparent hover:border-red-500 transition-all group active:scale-95">
            <div className="bg-red-50 p-4 rounded-2xl group-hover:bg-red-600 transition-colors">
              <LogIn className="text-red-600 group-hover:text-white w-6 h-6" />
            </div>
            <div className="ml-5 text-left">
              <h3 className="font-black text-gray-900 text-lg">Security Login</h3>
              <p className="text-xs text-gray-500 font-medium">Verify student gate movement</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (view === 'login' || view === 'signup') {
    const isLogin = view === 'login';
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col items-center justify-center">
        <button onClick={resetToMain} className="absolute top-8 left-8 text-[#002147] font-bold flex items-center hover:bg-gray-100 px-4 py-2 rounded-2xl transition-all border border-gray-100">
          <ChevronLeft size={20} className="mr-2" /> Back
        </button>
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-gray-900 mb-2 capitalize">{role} Portal</h2>
            <p className="text-gray-400 font-medium">{isLogin ? 'Enter credentials to sign in' : 'Register for new account'}</p>
          </div>
          <div className="space-y-6">
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                <input type="text" className="w-full px-5 py-4 rounded-2xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:outline-none transition-all font-medium" placeholder="Ex: Arjun Sharma" />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mobile Number</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black">+91</span>
                <input type="tel" value={phoneInput} onChange={handlePhoneChange} className="w-full pl-16 pr-5 py-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white transition-all font-black text-lg" placeholder="0000000000" maxLength={10} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Password</label>
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white transition-all font-medium" placeholder="••••••••" />
            </div>
            <button onClick={() => { if (phoneInput.length === 10) { setCurrentUser({ id: '1', role: role!, identifier: phoneInput, name: role === 'student' ? 'Arjun Sharma' : role === 'authority' ? 'Dean Admin' : 'Gate Post' }); setView('dashboard'); } }} disabled={phoneInput.length !== 10} className="w-full bg-[#002147] text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-[#003167] disabled:bg-gray-100 transition-all transform active:scale-95">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
          <div className="mt-8 text-center">
            <button onClick={() => setView(isLogin ? 'signup' : 'login')} className="text-xs text-gray-400 hover:text-blue-600 font-bold underline">
              {isLogin ? "New user? Signup here" : "Already registered? Login here"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    const displayApps = role === 'security' 
      ? applications.filter(app => app.status === ApplicationStatus.APPROVED)
      : applications;

    return (
      <div className="min-h-screen bg-[#FDFDFD]">
        <nav className="bg-white px-6 py-6 border-b border-gray-50 flex justify-between items-center sticky top-0 z-20 shadow-sm">
          <div className="flex items-center group cursor-pointer" onClick={resetToMain}>
            <div className="bg-[#002147] p-2.5 rounded-2xl mr-4 group-hover:scale-110 transition-transform">
               <Home className="text-white" size={24} />
            </div>
            <div>
              <h2 className="font-black text-xl text-[#002147] tracking-tight">GatePass Portal</h2>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">RGIPT Jais</p>
            </div>
          </div>
          <button onClick={resetToMain} className="text-[10px] bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">Logout</button>
        </nav>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                {role === 'student' ? 'My Recent Passes' : role === 'authority' ? 'Student Leave Review' : 'Gate Clearance Log'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">{currentUser?.name}</p>
            </div>
            {role === 'student' && (
              <button onClick={() => { detectLocation(); setView('apply'); }} className="bg-blue-600 text-white px-6 py-4 rounded-[2rem] text-sm font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95 transform">
                <FileText size={20} className="mr-3" /> Apply for Gate Pass
              </button>
            )}
          </div>
          <div className="grid gap-4">
            {displayApps.length === 0 && (
              <div className="bg-white py-20 rounded-[3rem] text-center shadow-sm border border-gray-100 flex flex-col items-center">
                <FileText className="text-gray-200" size={64} />
                <h3 className="text-gray-900 font-black text-xl mt-4">No active records</h3>
                <p className="text-gray-400 text-sm mt-2 max-w-xs font-medium">Verified applications will appear here for processing.</p>
              </div>
            )}
            {displayApps.map((app, idx) => (
              <div key={app.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex justify-between items-center hover:shadow-lg transition-all">
                <div className="flex-1">
                  <div className="flex items-center mb-1">
                    <span className="text-[10px] font-black text-gray-300 mr-2">#{idx+1}</span>
                    <h3 className="font-black text-[#002147] text-lg">{app.studentName}</h3>
                  </div>
                  <div className="text-gray-400 font-bold text-xs uppercase flex items-center">
                    <MapPin size={10} className="mr-1 text-blue-500" /> {app.place}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {app.status === ApplicationStatus.PENDING && <span className="text-[8px] bg-amber-50 text-amber-600 px-2 py-1 rounded-full font-black uppercase tracking-widest">Pending</span>}
                    {app.status === ApplicationStatus.APPROVED && <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-black uppercase tracking-widest">Approved</span>}
                    {app.status === ApplicationStatus.DECLINED && <span className="text-[8px] bg-rose-50 text-rose-600 px-2 py-1 rounded-full font-black uppercase tracking-widest">Declined</span>}
                  </div>
                </div>
                <button onClick={() => { setSelectedApp(app); setView('details'); }} className="bg-blue-50 text-blue-600 p-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                   <span className="font-black text-xs uppercase px-2">Review</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'apply') {
    return (
      <div className="min-h-screen bg-[#FDFDFD] pb-20">
        <nav className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center">
            <button onClick={() => setView('dashboard')} className="mr-4 p-3 hover:bg-gray-50 rounded-2xl transition-all text-[#002147]"><ChevronLeft size={24}/></button>
            <h2 className="font-black text-xl text-[#002147] tracking-tight">Request Entry</h2>
          </div>
          <button onClick={resetToMain} className="text-[10px] font-black uppercase bg-gray-100 px-4 py-2 rounded-xl">Back Home</button>
        </nav>
        <div className="p-6">
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            const formData = new FormData(e.currentTarget); 
            handleApply({ 
              studentName: formData.get('name') as string, rollNumber: formData.get('roll') as string, 
              program: formData.get('program') as any, year: formData.get('year') as any, 
              place: placeQuery, purpose: formData.get('purpose') as string, 
              departureDate: formData.get('depDate') as string, departureTime: formData.get('depTime') as string, 
              arrivalDate: formData.get('arrDate') as string, arrivalTime: formData.get('arrTime') as string, 
              contactNumber: phoneInput 
            }); 
          }} className="space-y-6 bg-white p-10 rounded-[3rem] shadow-2xl max-w-xl mx-auto border border-gray-50">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Full Name</label>
                <input required name="name" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none font-bold" defaultValue={currentUser?.name} />
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Roll No</label><input required name="roll" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" /></div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Program</label><select name="program" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold"><option>B.Tech</option><option>MBA</option><option>Phd</option></select></div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Year</label><select name="year" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold"><option>1</option><option>2</option><option>3</option><option>4</option></select></div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Mobile Contact</label><input required type="tel" value={phoneInput} onChange={handlePhoneChange} className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" maxLength={10} /></div>
              
              <div className="col-span-2 relative">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Destination</label>
                <div className="relative">
                  <input required autoComplete="off" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} className={`w-full px-5 py-3 rounded-xl border ${apiError ? 'border-amber-200' : 'border-gray-100'} bg-gray-50 focus:bg-white focus:outline-none font-bold transition-all`} placeholder="Where are you heading?" />
                  {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Loader2 className="animate-spin text-blue-500" size={16} /></div>}
                </div>
                {apiError && (
                  <div className="mt-2 flex items-center text-[10px] text-amber-700 font-bold bg-amber-50 p-2 rounded-lg border border-amber-100 shadow-sm animate-pulse">
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                    {apiError}
                  </div>
                )}
                {suggestions.length > 0 && !isQuotaExceeded && (
                  <div className="absolute z-40 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
                    {suggestions.map((s, idx) => (
                      <button key={idx} type="button" onClick={() => { setPlaceQuery(s.title); setSuggestions([]); }} className="w-full text-left px-5 py-3 hover:bg-blue-50 border-b border-gray-50 font-bold text-sm text-gray-800 transition-colors">
                        {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest ml-1">Reason for Visit</label>
                <textarea required name="purpose" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 h-24 font-bold resize-none" />
              </div>
              <div><label className="block text-[10px] font-black text-blue-500 uppercase mb-1 tracking-widest ml-1">Departure Date</label><input required name="depDate" type="date" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" /></div>
              <div><label className="block text-[10px] font-black text-blue-500 uppercase mb-1 tracking-widest ml-1">Departure Time</label><input required name="depTime" type="time" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" /></div>
              <div><label className="block text-[10px] font-black text-orange-500 uppercase mb-1 tracking-widest ml-1">Arrival Date</label><input required name="arrDate" type="date" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" /></div>
              <div><label className="block text-[10px] font-black text-orange-500 uppercase mb-1 tracking-widest ml-1">Arrival Time</label><input required name="arrTime" type="time" className="w-full px-5 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold" /></div>
            </div>
            <button type="submit" className="w-full mt-6 bg-[#002147] text-white py-5 rounded-[2rem] font-black text-lg hover:bg-blue-900 active:scale-95 transition-all transform shadow-xl">Apply for Gate Pass</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'details' && selectedApp) {
    const isStudent = role === 'student';
    const isAuthority = role === 'authority';
    const isSecurity = role === 'security';

    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-20">
        <nav className="bg-[#002147] px-6 py-6 text-white flex items-center justify-between sticky top-0 z-40 shadow-xl">
          <div className="flex items-center">
            <button onClick={() => { setSelectedApp(null); setView('dashboard'); setIsDeclining(false); }} className="mr-4 p-2.5 hover:bg-blue-900 rounded-2xl transition-all"><ChevronLeft size={24}/></button>
            <span className="font-black tracking-tight text-xl uppercase">Pass Verification</span>
          </div>
          <button onClick={resetToMain} className="text-[10px] font-black uppercase bg-white/10 px-4 py-2 rounded-xl">Home</button>
        </nav>
        <div className="p-6">
          <div className="bg-white rounded-[4rem] shadow-2xl overflow-hidden max-w-lg mx-auto border border-gray-100">
            <div className={`p-12 text-center ${selectedApp.status === 'APPROVED' ? 'bg-emerald-600' : selectedApp.status === 'DECLINED' ? 'bg-rose-600' : 'bg-amber-500'} text-white relative transition-colors duration-500`}>
              {selectedApp.status === 'APPROVED' && <CheckCircle className="mx-auto mb-4" size={56}/>}
              {selectedApp.status === 'DECLINED' && <XCircle className="mx-auto mb-4" size={56}/>}
              {selectedApp.status === 'PENDING' && <Clock className="mx-auto mb-4" size={56}/>}
              <h3 className="font-black text-2xl uppercase tracking-widest">{selectedApp.status}</h3>
              {selectedApp.gatePassNumber && (
                <div className="mt-6 bg-black/20 p-4 rounded-3xl backdrop-blur-md border border-white/20">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">Gate Pass ID</p>
                  <p className="font-mono font-black text-3xl tracking-[0.2em]">{selectedApp.gatePassNumber}</p>
                </div>
              )}
            </div>
            <div className="p-10 space-y-8 bg-white">
              {isSecurity && (
                <div className="bg-gray-900 rounded-3xl p-6 text-center shadow-2xl border-4 border-gray-800">
                  <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.3em] mb-2 flex items-center justify-center">
                    <Timer size={12} className="mr-2" /> Current Station Time
                  </p>
                  <p className="font-mono text-white text-4xl font-black tracking-widest">
                    {currentTime.toLocaleTimeString('en-IN', { hour12: false })}
                  </p>
                  <p className="text-gray-500 text-[10px] mt-1 font-bold">
                    {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              )}

              {isStudent && selectedApp.status === 'PENDING' && (
                <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-dashed border-blue-200 text-center animate-pulse">
                  <p className="font-black text-blue-900 text-lg">your application has been submitted, authority will take action soon......</p>
                </div>
              )}
              {isStudent && selectedApp.status === 'APPROVED' && (
                <div className="text-center">
                  <p className="font-black text-emerald-900 text-xl">your application has bee approved by authority</p>
                  <button onClick={() => downloadPassPDF(selectedApp)} className="mt-6 flex items-center justify-center w-full bg-emerald-600 text-white py-4 rounded-3xl font-black text-lg shadow-xl hover:bg-emerald-700 transition-all"><Download size={20} className="mr-2" /> Download Official PDF</button>
                </div>
              )}
              {selectedApp.status === 'DECLINED' && (
                <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100">
                  <p className="font-black text-rose-900 text-lg text-center mb-2 uppercase tracking-tight">Application Declined</p>
                  <div className="p-3 bg-white/60 rounded-xl border border-rose-200">
                    <p className="text-[10px] text-rose-400 font-black uppercase mb-1 tracking-widest">Official Reason</p>
                    <p className="text-sm font-bold text-rose-800 italic">"{selectedApp.declineReason}"</p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-y-6 gap-x-12 border-b border-gray-50 pb-8">
                <div><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Student</p><p className="font-black text-gray-900 text-lg">{selectedApp.studentName}</p></div>
                <div><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Roll No</p><p className="font-black text-gray-900 text-lg">{selectedApp.rollNumber}</p></div>
                <div><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Program</p><p className="font-black text-gray-900 text-lg">{selectedApp.program}</p></div>
                <div><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Year</p><p className="font-black text-gray-900 text-lg">{selectedApp.year}</p></div>
                <div className="col-span-2"><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Destination</p><p className="font-black text-gray-900 text-xl tracking-tight">{selectedApp.place}</p></div>
                <div className="col-span-2"><p className="text-[9px] text-gray-300 font-black uppercase tracking-widest mb-1">Purpose</p><p className="text-sm font-bold text-gray-600 italic">"{selectedApp.purpose}"</p></div>
                <div className="col-span-1"><p className="text-[9px] text-blue-500 font-black uppercase mb-1">Departure</p><p className="font-black text-gray-900 text-sm">{selectedApp.departureDate} at {selectedApp.departureTime}</p></div>
                <div className="col-span-1"><p className="text-[9px] text-orange-500 font-black uppercase mb-1">Inbound</p><p className="font-black text-gray-900 text-sm">{selectedApp.arrivalDate} at {selectedApp.arrivalTime}</p></div>
              </div>

              {(selectedApp.outTime || selectedApp.inTime) && (
                <div className="space-y-4">
                  {selectedApp.outTime && (
                    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] text-indigo-400 font-black uppercase tracking-widest">Logged Exit</p>
                        <p className="font-black text-indigo-900 text-xs">{selectedApp.outTime}</p>
                      </div>
                      <Navigation size={16} className="text-indigo-400 rotate-90" />
                    </div>
                  )}
                  {selectedApp.inTime && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest">Logged Entry</p>
                        <p className="font-black text-emerald-900 text-xs">{selectedApp.inTime}</p>
                      </div>
                      <Navigation size={16} className="text-emerald-400 -rotate-90" />
                    </div>
                  )}
                </div>
              )}
              
              {isAuthority && selectedApp.status === 'PENDING' && (
                <div className="space-y-4">
                  {!isDeclining ? (
                    <div className="flex gap-4">
                      <button onClick={() => setIsDeclining(true)} className="flex-1 bg-white text-rose-600 py-5 rounded-[2rem] font-black text-lg border-2 border-rose-100 hover:bg-rose-50 transition-all shadow-sm">Decline</button>
                      <button onClick={() => handleApprove(selectedApp.id)} className="flex-1 bg-[#002147] text-white py-5 rounded-[2rem] font-black text-lg hover:bg-blue-900 transition-all shadow-xl">Approve</button>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-rose-50 p-6 rounded-[2rem] border border-rose-100 animate-in fade-in slide-in-from-bottom-2">
                      <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Reason for Decline (Mandatory)</label>
                      <textarea 
                        value={declineReasonInput} 
                        onChange={(e) => setDeclineReasonInput(e.target.value)} 
                        placeholder="Explain why this request is being rejected..." 
                        className="w-full px-4 py-3 rounded-xl border border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold text-sm h-24 resize-none"
                      />
                      <div className="flex gap-3">
                        <button onClick={() => setIsDeclining(false)} className="flex-1 bg-white text-gray-400 py-3 rounded-2xl font-black text-xs uppercase border border-gray-200 hover:bg-gray-50 transition-all">Cancel</button>
                        <button onClick={() => finalizeDecline(selectedApp.id)} disabled={!declineReasonInput.trim()} className="flex-[2] bg-rose-600 text-white py-3 rounded-2xl font-black text-xs uppercase shadow-lg shadow-rose-200 hover:bg-rose-700 disabled:bg-rose-300 transition-all">Submit Decline</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {isSecurity && selectedApp.status === 'APPROVED' && (
                <div className="space-y-4 pt-4">
                  {!selectedApp.outTime && (
                    <button 
                      onClick={() => handleSecurityAction(selectedApp.id, 'out')} 
                      className="w-full bg-[#002147] text-white py-6 rounded-[2.5rem] font-black text-xl flex flex-col items-center justify-center shadow-xl hover:bg-blue-950 active:scale-95 transition-all transform"
                    >
                      <div className="flex items-center mb-1">
                        <Navigation size={24} className="mr-3 rotate-90" /> Record Student Exit
                      </div>
                      <span className="text-[10px] text-blue-300 uppercase tracking-[0.2em] font-medium">Capture Station Time Now</span>
                    </button>
                  )}
                  {selectedApp.outTime && !selectedApp.inTime && (
                    <button 
                      onClick={() => handleSecurityAction(selectedApp.id, 'in')} 
                      className="w-full bg-emerald-600 text-white py-6 rounded-[2.5rem] font-black text-xl flex flex-col items-center justify-center shadow-xl hover:bg-emerald-700 active:scale-95 transition-all transform"
                    >
                      <div className="flex items-center mb-1">
                        <Navigation size={24} className="mr-3 -rotate-90" /> Record Student Entry
                      </div>
                      <span className="text-[10px] text-emerald-200 uppercase tracking-[0.2em] font-medium">Capture Station Time Now</span>
                    </button>
                  )}
                  {selectedApp.inTime && (
                    <div className="p-6 bg-gray-50 rounded-[2rem] text-center border border-dashed border-gray-200">
                      <p className="text-gray-400 font-black text-xs uppercase tracking-widest">Gate Movement Session Closed</p>
                      <p className="text-[10px] text-gray-300 mt-1">Both Exit and Entry timestamps verified.</p>
                    </div>
                  )}
                </div>
              )}
              
              <button onClick={() => { setSelectedApp(null); setView('dashboard'); setIsDeclining(false); }} className="w-full text-center text-gray-300 text-[10px] font-black uppercase tracking-[0.4em] hover:text-[#002147] transition-all">Back to List</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
       <div className="w-16 h-16 border-4 border-gray-100 border-t-[#002147] rounded-full animate-spin"></div>
       <p className="text-gray-400 font-black uppercase tracking-widest text-[9px] mt-8">Establishing Network...</p>
    </div>
  );
};

export default App;

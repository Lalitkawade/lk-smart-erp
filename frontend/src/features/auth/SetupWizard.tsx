import React, { useState } from 'react';

interface SetupWizardProps {
  onComplete: (data: {
    companyName: string;
    companyCode: string;
    ownerName: string;
    ownerEmail: string;
    password: string;
  }) => Promise<any>;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [companyName, setCompanyName] = useState('Maharudra Hardware');
  const [companyCode, setCompanyCode] = useState('LKHARDWARE');
  const [ownerName, setOwnerName] = useState('Lalit Kawade');
  const [ownerEmail, setOwnerEmail] = useState('kawadelalit@gmail.com');
  const [password, setPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (!companyName.trim() || !ownerEmail.trim() || !password.trim()) {
        throw new Error('Please fill in all required fields.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      await onComplete({
        companyName: companyName.trim(),
        companyCode: companyCode.trim() || 'LKHARDWARE',
        ownerName: ownerName.trim() || 'Store Owner',
        ownerEmail: ownerEmail.trim().toLowerCase(),
        password: password
      });
    } catch (err: any) {
      console.error('Setup Wizard Error:', err);
      setErrorMsg(err.message || 'Setup failed. Please check your network and credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-amber-300 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20 text-slate-950 text-2xl font-black">
            <i className="fa-solid fa-store"></i>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              First-Time Store Setup
            </h1>
            <p className="text-xs text-amber-400 font-bold uppercase tracking-widest mt-1">
              Initialize Your Multi-Tenant LK Smart ERP Instance
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation text-sm shrink-0"></i>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          
          {/* Store / Company Name */}
          <div>
            <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">
              Store / Company Name *
            </label>
            <input
              type="text"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              placeholder="e.g. Maharudra Hardware & Electricals"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          {/* Company Code */}
          <div>
            <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">
              Company Code (Short Identifier)
            </label>
            <input
              type="text"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold uppercase"
              placeholder="e.g. LKHARDWARE"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
            />
          </div>

          {/* Owner Full Name */}
          <div>
            <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">
              Store Owner / Admin Name *
            </label>
            <input
              type="text"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              placeholder="e.g. Lalit Kawade"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>

          {/* Owner Email */}
          <div>
            <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">
              Owner Email Address (Supabase Auth Login) *
            </label>
            <input
              type="email"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              placeholder="owner@yourstore.com"
              required
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                placeholder="Minimum 6 characters"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1"
                title={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-3.5 px-4 rounded-xl text-sm transition shadow-lg shadow-amber-500/20 cursor-pointer uppercase tracking-wider mt-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-spinner animate-spin"></i>
                Provisioning Store & Auth Account...
              </span>
            ) : (
              '🚀 Complete Setup & Launch ERP'
            )}
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800 text-center text-[11px] text-slate-400 font-medium">
          Powered by Supabase Cloud Auth & Multi-Tenant RLS Security
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { supabase } from '../../api/supabase';

interface SettingsProps {
  tenantId: string;
  onSettingsSaved?: () => void;
}

export default function Settings({ tenantId, onSettingsSaved }: SettingsProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [companyName, setCompanyName] = useState('LK Hardware ERP');
  const [logoUrl, setLogoUrl] = useState('');
  const [gstin, setGstin] = useState('27LKSERP401Z2B5');
  const [address, setAddress] = useState('123 Market Road, Pune, Maharashtra');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');

  // Operators List
  const [operators, setOperators] = useState<Array<{ email: string; username: string; role: string }>>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    username: '',
    role: 'Cashier'
  });

  const fetchSettings = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setInvoicePrefix(data.invoice_prefix || 'INV');
        setGstin(data.gstin || '27LKSERP401Z2B5');
        setAddress(data.address || '123 Market Road, Pune, Maharashtra');
        setLogoUrl(data.logo_url || '');
      }

      // Fetch tenant company name
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantData) {
        setCompanyName(tenantData.company_name);
      }

      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', tenantId);

      if (profilesData) {
        setOperators(profilesData.map(p => ({
          email: (p.username || 'user').toLowerCase() + '@lkhardware.com',
          username: p.username || 'User',
          role: p.role || 'Cashier'
        })));
      }
    } catch (e) {
      console.error('Failed to fetch settings from Supabase:', e);
    }
  };

  useEffect(() => {
    fetchSettings();
    window.addEventListener('storage', fetchSettings);
    return () => window.removeEventListener('storage', fetchSettings);
  }, [tenantId]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '9999') {
      setIsUnlocked(true);
      setPinError('');
    } else {
      setPinError('Invalid Admin Passcode! Please try again.');
    }
  };

  const handleSaveCompanyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Save settings
      const { error: settingsErr } = await supabase
        .from('settings')
        .upsert({
          tenant_id: tenantId,
          invoice_prefix: invoicePrefix,
          gstin: gstin,
          address: address,
          business_type: 'Hardware Shop',
          logo_url: logoUrl
        }, { onConflict: 'tenant_id' });

      if (settingsErr) throw settingsErr;

      // 2. Update tenant company name
      const { error: tenantErr } = await supabase
        .from('tenants')
        .update({
          company_name: companyName
        })
        .eq('id', tenantId);

      if (tenantErr) throw tenantErr;

      // Cache settings locally for synchronous legacy reporting utilities
      const config = {
        company_name: companyName,
        logo_url: logoUrl,
        gstin: gstin,
        address: address,
        invoice_prefix: invoicePrefix,
        business_type: 'Hardware Shop'
      };
      localStorage.setItem('lk_settings', JSON.stringify(config));
      
      // Sync with active session tenant name so sidebars update instantly
      const sessionStr = localStorage.getItem('lk_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session.tenant) {
            session.tenant.company_name = companyName;
            localStorage.setItem('lk_session', JSON.stringify(session));
          }
        } catch (err) {}
      }

      alert('Company configurations successfully saved!');
      if (onSettingsSaved) onSettingsSaved();
      window.dispatchEvent(new Event('storage'));
    } catch (err: any) {
      alert('Failed to save configuration settings: ' + err.message);
    }
  };

  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.username) return;

    try {
      // Register operator credential inside Supabase auth
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: newUser.email,
        password: 'password123'
      });

      if (signUpErr) throw signUpErr;
      if (!data.user) throw new Error('User creation failed');

      // Create matching Profile registry
      const { error: profErr } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          tenant_id: tenantId,
          username: newUser.username.toUpperCase(),
          role: newUser.role,
          status: 'Active'
        });

      if (profErr) throw profErr;

      await fetchSettings();
      setShowUserModal(false);
      setNewUser({ email: '', username: '', role: 'Cashier' });
      alert(`New operator successfully created! Default login password is: password123`);
    } catch (err: any) {
      alert('Failed to provision operator account: ' + err.message);
    }
  };

  const handleDeleteOperator = async (email: string) => {
    const operator = operators.find(o => o.email === email);
    if (!operator) return;
    if (operator.role === 'Owner') {
      alert('Cannot delete the primary owner account!');
      return;
    }
    if (!window.confirm(`Remove user ${email}?`)) return;

    try {
      // Delete matching profile record
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('username', operator.username);

      if (error) throw error;
      await fetchSettings();
      alert('Operator successfully removed.');
    } catch (err: any) {
      alert('Failed to delete operator account: ' + err.message);
    }
  };

  // Secure Passcode Lock screen
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-secondary border border-border p-8 rounded-2xl shadow-xl space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xl mx-auto mb-2">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 className="text-lg font-bold text-foreground">Admin Settings Security Lock</h2>
          <p className="text-xs text-textMuted font-semibold">Only store owners or system administrators can adjust parameters. Please enter the Settings PIN.</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-textSecondary mb-1">Enter Admin PIN (Default: 9999)</label>
            <input type="password" maxLength={6} className="w-full bg-background border border-border rounded-lg p-3 text-center text-lg text-foreground font-mono tracking-widest focus:ring-2 focus:ring-primary outline-none"
              placeholder="••••" value={pinInput} onChange={(e) => setPinInput(e.target.value)} required />
          </div>

          {pinError && (
            <div className="text-xs text-rose-500 text-center font-bold">{pinError}</div>
          )}

          <button type="submit" className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm transition shadow-md cursor-pointer">
            Unlock Settings
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Company Settings Form */}
        <div className="lg:col-span-2 bg-secondary border border-border rounded-xl p-6 shadow-lg">
          <h3 className="text-md font-bold text-foreground mb-6 flex items-center gap-2">
            <i className="fa-solid fa-store text-primary"></i> Store & Company Profile Setup
          </h3>

          <form onSubmit={handleSaveCompanyConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Company Name</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:border-primary font-semibold"
                  value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">GSTIN Number</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground font-mono focus:outline-none"
                  value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Invoice Number Prefix</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground font-mono uppercase focus:outline-none"
                  value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} maxLength={6} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Active Business Type</label>
                <input type="text" className="w-full bg-background/40 border border-border rounded-lg p-2.5 text-sm text-textMuted font-bold focus:outline-none"
                  value="Hardware Shop" disabled />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-textSecondary mb-1">Store Address</label>
                <textarea className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none" rows={2}
                  value={address} onChange={(e) => setAddress(e.target.value)} required />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-textSecondary mb-1">Logo URL (Optional)</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none"
                  value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm transition shadow-md cursor-pointer">
                Save Configurations
              </button>
            </div>
          </form>
        </div>

        {/* User Operators Manager */}
        <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-md font-bold text-foreground flex items-center gap-2">
                <i className="fa-solid fa-user-shield text-primary"></i> Staff Operators
              </h3>
              <button className="text-xs text-primary hover:text-primary/80 font-bold cursor-pointer" onClick={() => setShowUserModal(true)}>
                + Add User
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {operators.map(op => (
                <div key={op.email} className="p-3 bg-background/40 border border-border rounded-lg flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-foreground">{op.username}</div>
                    <div className="text-[10px] text-textMuted mt-0.5">{op.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-2 py-0.5 bg-background border border-border text-textSecondary rounded-md font-mono">
                      {op.role}
                    </span>
                    <button className="text-[10px] text-rose-500 hover:text-rose-400 font-bold" onClick={() => handleDeleteOperator(op.email)}>
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-textMuted text-center mt-6 pt-4 border-t border-border">
            Version 1.0.0 • Developed by <span className="font-bold text-primary">LK Digital Solution</span> (Ph: <a href="tel:9270138287" className="underline hover:text-primary">9270138287</a>) • License Activated
          </div>
        </div>

      </div>

      {/* Add User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-secondary border border-border p-6 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Create Operator Account</h3>
              <button className="text-textSecondary hover:text-foreground" onClick={() => setShowUserModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleAddOperator} className="space-y-4">
              <div>
                <label className="block text-xs text-textSecondary mb-1">Operator Full Name</label>
                <input type="text" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground uppercase font-bold"
                  value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Operator Login Email</label>
                <input type="email" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground"
                  value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Assigned Role</label>
                <select className="w-full bg-background border border-border rounded p-2 text-xs text-foreground"
                  value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="Manager">Manager</option>
                  <option value="Cashier">Cashier</option>
                  <option value="Sales Person">Sales Person</option>
                  <option value="Store Keeper">Store Keeper</option>
                  <option value="Accountant">Accountant</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" className="flex-1 py-2 border border-border text-textSecondary rounded text-xs" onClick={() => setShowUserModal(false)}>Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded text-xs transition cursor-pointer">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

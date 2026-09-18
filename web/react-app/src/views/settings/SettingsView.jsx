import React from 'react';
import { Settings, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ProfileSettings from '../../components/settings/ProfileSettings';
import SecuritySettings from '../../components/settings/SecuritySettings';
import ThemePreferences from '../../components/settings/ThemePreferences';

export default function SettingsView() {
  const { user } = useAuth();

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
            Account Preferences
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
            User Settings
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
          Settings & Security
        </h1>
        <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
          Manage your official personnel identity, update login credentials, and configure display preferences.
        </p>
      </div>

      {/* Section 1: Profile & Contact */}
      <section className="bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <ProfileSettings user={user} />
      </section>

      {/* Section 2: Appearance & Theme */}
      <section className="bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <ThemePreferences />
      </section>

      {/* Section 3: Security & Password */}
      <section className="bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <SecuritySettings />
      </section>
    </div>
  );
}

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import ProfileSettings from '../../components/settings/ProfileSettings';
import SecuritySettings from '../../components/settings/SecuritySettings';
import ThemePreferences from '../../components/settings/ThemePreferences';

export default function SettingsView() {
  const { user, refreshSession } = useAuth();

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
            Account Preferences
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/20">
            User Settings
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
          Settings &amp; Security
        </h1>
        <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
          Manage your official personnel identity, update login credentials, and configure display preferences.
        </p>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        {/* Left Column: Personnel Profile & Theme Preferences (6 cols) */}
        <div className="lg:col-span-6 flex flex-col gap-5 sm:gap-6">
          {/* Card 1: Profile & Contact */}
          <section className="bg-surface rounded-2xl border border-border p-4 sm:p-5 shadow-2xs">
            <ProfileSettings user={user} onUserUpdated={refreshSession} />
          </section>

          {/* Card 2: Appearance & Theme */}
          <section className="bg-surface rounded-2xl border border-border p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between">
            <ThemePreferences />
          </section>
        </div>

        {/* Right Column: Security & Credentials Form (6 cols) */}
        <div className="lg:col-span-6 flex flex-col">
          <section className="bg-surface rounded-2xl border border-border p-4 sm:p-5 shadow-2xs lg:h-full flex flex-col">
            <SecuritySettings className="flex-1 flex flex-col justify-between" />
          </section>
        </div>
      </div>
    </div>
  );
}

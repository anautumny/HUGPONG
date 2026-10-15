import React from 'react';
import { MessageSquareText, Users, Circle, CircleCheck } from 'lucide-react';

export default function VerificationMethodChoices({ value, onChange, disabled = false }) {
  const options = [
    { value: 'sms', title: 'Verify using an SMS code', description: 'For supported mobile networks.', icon: MessageSquareText },
    { value: 'review', title: 'Request authorized verification review', description: 'Use this for Smart/TNT or when SMS is unavailable.', icon: Users }
  ];
  return <div role="radiogroup" aria-label="Choose a verification method" className="flex flex-col gap-3">
    {options.map((option, index) => {
      const selected = value === option.value, Icon = option.icon, Indicator = selected ? CircleCheck : Circle;
      return <button key={option.value} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onChange(option.value)}
        tabIndex={selected || (!value && index === 0) ? 0 : -1}
        onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const next = (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + options.length) % options.length;
          onChange(options[next].value);
          event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next]?.focus();
        }}
        className={`flex min-h-[88px] w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-primary p-4 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'bg-primary text-white' : 'bg-surface text-hug-text hover:bg-primary-bg dark:hover:bg-primary/10'}`}>
        <Icon className="h-6 w-6 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{option.title}</span><span className={`mt-1 block text-xs ${selected ? 'text-white/90' : 'text-hug-muted'}`}>{option.description}</span></span><Indicator className="h-6 w-6 shrink-0" />
      </button>;
    })}
  </div>;
}

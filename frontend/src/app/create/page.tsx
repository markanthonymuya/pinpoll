'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CodeSuggestions } from '@/components/CodeSuggestions';
import { api } from '@/lib/api';
import type { DeduplicationMode, Poll } from '@/lib/types';

type Step = 'topic' | 'code' | 'password' | 'dedup' | 'options' | 'settings' | 'transparency' | 'confirm';

interface OptionDraft {
  name: string;
  image_url: string | null;
  icon_key: string | null;
  loadingImage: boolean;
}

export default function CreatePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState('');
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dedupMode, setDedupMode] = useState<DeduplicationMode>('cookie');
  const [optionInput, setOptionInput] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [autoCloseValue, setAutoCloseValue] = useState('');
  const [autoCloseUnit, setAutoCloseUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [transparencyChecked, setTransparencyChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdPoll, setCreatedPoll] = useState<Poll | null>(null);

  async function loadCodeSuggestions() {
    try {
      const r = await api.getCodeSuggestions(topic);
      setCodeSuggestions(r.suggestions);
      setSelectedCode(r.suggestions[0] ?? '');
    } catch (_) {}
  }

  async function fetchImage(name: string, idx: number) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, loadingImage: true } : o))
    );
    const { url } = await api.searchUnsplash(name).catch(() => ({ url: null }));
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, image_url: url, loadingImage: false } : o))
    );
  }

  async function addOption() {
    const names = optionInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const newOptions: OptionDraft[] = names.map((name) => ({ name, image_url: null, icon_key: null, loadingImage: false }));
    let startIdx = 0;
    setOptions((prev) => {
      startIdx = prev.length;
      return [...prev, ...newOptions];
    });
    setOptionInput('');
    await Promise.all(names.map((_, i) => fetchImage(names[i], startIdx + i)));
  }

  function computeAutoCloseAt(): string | undefined {
    if (!autoCloseValue || !parseInt(autoCloseValue)) return undefined;
    const ms =
      parseInt(autoCloseValue) *
      (autoCloseUnit === 'minutes' ? 60_000 : autoCloseUnit === 'hours' ? 3_600_000 : 86_400_000);
    return new Date(Date.now() + ms).toISOString();
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const { poll } = await api.createPoll({
        topic,
        code: selectedCode,
        password,
        deduplication_mode: dedupMode,
        auto_close_at: computeAutoCloseAt(),
      });

      // Add all options
      for (const opt of options) {
        await api.addOption(poll.code, {
          name: opt.name,
          password,
          image_url: opt.image_url ?? undefined,
          icon_key: opt.icon_key ?? undefined,
        });
      }

      setCreatedPoll(poll);
      setStep('confirm');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function downloadReminderCard() {
    if (!createdPoll) return;
    const text = [
      'PinPoll — Your Poll Details',
      '',
      `Topic: ${createdPoll.topic}`,
      `Public link: ${window.location.origin}/poll/${createdPoll.code}`,
      `Manage link: ${window.location.origin}/manage/${createdPoll.code}`,
      '',
      'Keep this file safe — you cannot recover your password.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pinpoll-${createdPoll.code}.txt`;
    a.click();
  }

  if (step === 'confirm' && createdPoll) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-lg w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Your poll is live!</h1>
          <p className="text-gray-500 mb-6 text-sm">Save these links — you cannot recover your password.</p>
          <div className="flex flex-col gap-3 text-left mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-blue-400 font-semibold mb-1">PUBLIC LINK (share with audience)</p>
              <p className="font-mono text-sm break-all">{origin}/poll/{createdPoll.code}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(`${origin}/poll/${createdPoll.code}`)} className="text-xs text-blue-500 hover:underline mt-1">Copy</button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-400 font-semibold mb-1">MANAGE LINK (keep private)</p>
              <p className="font-mono text-sm break-all">{origin}/manage/{createdPoll.code}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(`${origin}/manage/${createdPoll.code}`)} className="text-xs text-blue-500 hover:underline mt-1">Copy</button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={downloadReminderCard} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
              Download reminder card
            </button>
            <button type="button" onClick={() => router.push(`/manage/${createdPoll.code}`)} className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors">
              Go to manage →
            </button>
          </div>
        </div>
      </main>
    );
  }

  const STEPS: Step[] = ['topic', 'code', 'password', 'dedup', 'options', 'settings', 'transparency'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {step === 'topic' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">What&apos;s your poll question?</h2>
              <textarea
                className="border-2 border-gray-200 rounded-xl p-4 text-lg resize-none focus:outline-none focus:border-blue-400"
                rows={3}
                placeholder="Best programming language for beginners?"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                disabled={!topic.trim()}
                onClick={() => { void loadCodeSuggestions(); setStep('code'); }}
                className="w-full py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
              >
                Next →
              </button>
            </div>
          )}

          {step === 'code' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Choose your poll link</h2>
              <p className="text-gray-500 text-sm">This is the memorable code that appears in your poll URL.</p>
              <CodeSuggestions
                suggestions={codeSuggestions}
                selected={selectedCode}
                onSelect={setSelectedCode}
                topic={topic}
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('topic')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button type="button" onClick={() => setStep('password')} className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl">
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'password' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Set a password</h2>
              <p className="text-amber-600 text-sm font-medium bg-amber-50 rounded-lg p-3">
                ⚠️ If you lose this, you cannot manage or delete your poll.
              </p>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 text-lg focus:outline-none focus:border-blue-400 pr-16"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <p className="text-red-500 text-sm">Password must be at least 6 characters.</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('code')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button
                  type="button"
                  disabled={password.length < 6}
                  onClick={() => setStep('dedup')}
                  className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'dedup' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">How should we prevent duplicate votes?</h2>
              {[
                { value: 'cookie', title: 'Standard (Cookie-based)', desc: 'No personal data collected. One vote per browser.' },
                { value: 'email_hash', title: 'Verified (Email hash)', desc: 'Voter enters email. Only a one-way SHA-256 hash is stored. Email is never saved. A "Verified Poll" badge is shown.' },
              ].map(({ value, title, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setDedupMode(value as DeduplicationMode); setStep('options'); }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${dedupMode === value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  <p className="font-bold">{title}</p>
                  <p className="text-sm text-gray-500 mt-1">{desc}</p>
                </button>
              ))}
              <button type="button" onClick={() => setStep('password')} className="py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
            </div>
          )}

          {step === 'options' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Add options</h2>
              <p className="text-gray-500 text-sm">Type one or multiple options separated by commas.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
                  placeholder="Python, JavaScript, Rust"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addOption(); } }}
                />
                <button type="button" onClick={() => void addOption()} className="px-4 py-2 bg-blue-500 text-white rounded-xl font-semibold">
                  Add
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    {opt.loadingImage ? (
                      <div className="w-10 h-10 bg-gray-200 rounded animate-pulse" />
                    ) : opt.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={opt.image_url} alt={opt.name} className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-blue-400 rounded flex items-center justify-center text-white font-bold">
                        {opt.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium">{opt.name}</span>
                    <button type="button" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep('dedup')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={options.length === 0}
                  onClick={() => setStep('settings')}
                  className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'settings' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Settings</h2>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-3">When should the poll close?</label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoCloseValue('')}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${!autoCloseValue ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                  >
                    <p className="font-bold">Indefinite</p>
                    <p className="text-sm text-gray-500 mt-1">You close it manually from the manage panel.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!autoCloseValue) setAutoCloseValue('30'); }}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${autoCloseValue ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                  >
                    <p className="font-bold">Auto-close after</p>
                    <p className="text-sm text-gray-500 mt-1">Poll closes automatically after a set time.</p>
                  </button>
                </div>
                {autoCloseValue !== '' && (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="number"
                      min={1}
                      className="w-24 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
                      value={autoCloseValue}
                      onChange={(e) => setAutoCloseValue(e.target.value)}
                      autoFocus
                    />
                    <select
                      className="flex-1 border-2 border-gray-200 rounded-xl p-3 bg-white focus:outline-none focus:border-blue-400"
                      value={autoCloseUnit}
                      onChange={(e) => setAutoCloseUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep('options')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button type="button" onClick={() => setStep('transparency')} className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl">Next →</button>
              </div>
            </div>
          )}

          {step === 'transparency' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">One last thing</h2>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 w-5 h-5 flex-shrink-0 accent-blue-500"
                    checked={transparencyChecked}
                    onChange={(e) => setTransparencyChecked(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">
                    All votes, including timestamps and option selections, are publicly accessible and downloadable for research purposes.
                  </span>
                </label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('settings')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button
                  type="button"
                  disabled={!transparencyChecked || submitting}
                  onClick={() => void submit()}
                  className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  {submitting ? 'Creating…' : 'Go Live →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

import { useState, useMemo } from 'react';
import breedsData from '../data/breeds.json';
import { calculate, type CalculatorInput, type Species, type SpendingBucket } from '../lib/calculator';
import Verdict from './Verdict';

type Step = 1 | 2 | 3;

interface FormState {
  species: Species;
  breed: string;
  ageNow: string;
  ageAcquired: string;
  spendingBucket: SpendingBucket | '';
  routinePercent: number;
  largestBill: CalculatorInput['largestBill'] | '';
  incidents: string[];
  hasInsurance: boolean | null;
  wouldBuyAgain: 'yes' | 'no' | 'unsure' | '';
}

const DOG_INCIDENTS = [
  { value: 'surgery',   label: 'Surgery (any type)' },
  { value: 'cancer',    label: 'Cancer treatment' },
  { value: 'emergency', label: 'Emergency / poisoning' },
  { value: 'chronic',   label: 'Chronic condition' },
  { value: 'hipJoint',  label: 'Hip / joint issues' },
  { value: 'dental',    label: 'Dental procedure' },
  { value: 'bloat',     label: 'Bloat / GDV' },
  { value: 'none',      label: 'None of these' },
];

const CAT_INCIDENTS = [
  { value: 'surgery',   label: 'Surgery (any type)' },
  { value: 'cancer',    label: 'Cancer treatment' },
  { value: 'urinary',   label: 'Urinary blockage' },
  { value: 'chronic',   label: 'Chronic condition (kidney/diabetes/thyroid)' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'dental',    label: 'Dental procedure' },
  { value: 'none',      label: 'None of these' },
];

const SPENDING_OPTIONS: { value: SpendingBucket; label: string }[] = [
  { value: 'under500',      label: 'Under $500' },
  { value: '500to1500',     label: '$501 – $1,500' },
  { value: '1500to5000',    label: '$1,501 – $5,000' },
  { value: '5000to15000',   label: '$5,001 – $15,000' },
  { value: 'over15000',     label: 'Over $15,000' },
];

const BILL_OPTIONS: { value: CalculatorInput['largestBill']; label: string }[] = [
  { value: 'under300',    label: 'Under $300' },
  { value: '300to1000',   label: '$300 – $1,000' },
  { value: '1000to3000',  label: '$1,001 – $3,000' },
  { value: '3000to5000',  label: '$3,001 – $5,000' },
  { value: 'over5000',    label: 'Over $5,000' },
];

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-2.5 rounded-lg border-2 font-medium transition-all text-sm ${
        active
          ? 'border-teal-700 bg-teal-700 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:border-teal-500'
      }`}
    >
      {children}
    </button>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
            value === opt.value
              ? 'border-teal-700 bg-teal-50'
              : 'border-gray-200 bg-white hover:border-teal-300'
          }`}
        >
          <input
            type="radio"
            name={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-teal-700"
          />
          <span className="text-sm text-gray-800">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function Calculator() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({
    species: 'dog',
    breed: '',
    ageNow: '',
    ageAcquired: '',
    spendingBucket: '',
    routinePercent: 30,
    largestBill: '',
    incidents: [],
    hasInsurance: null,
    wouldBuyAgain: '',
  });
  const [result, setResult] = useState<ReturnType<typeof calculate> | null>(null);
  const [breedSearch, setBreedSearch] = useState('');
  const [showBreedList, setShowBreedList] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'submitted' | 'dismissed'>('idle');

  const breeds = useMemo(
    () => (form.species === 'dog' ? breedsData.dogs : breedsData.cats),
    [form.species]
  );

  const filteredBreeds = useMemo(
    () =>
      breedSearch.length < 1
        ? breeds.slice(0, 40)
        : breeds.filter((b) =>
            b.name.toLowerCase().includes(breedSearch.toLowerCase())
          ).slice(0, 40),
    [breeds, breedSearch]
  );

  const selectedBreed = useMemo(
    () => breeds.find((b) => b.name === form.breed),
    [breeds, form.breed]
  );

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function toggleIncident(val: string) {
    setForm((f) => {
      if (val === 'none') return { ...f, incidents: ['none'] };
      const without = f.incidents.filter((i) => i !== 'none');
      const has = without.includes(val);
      return { ...f, incidents: has ? without.filter((i) => i !== val) : [...without, val] };
    });
  }

  function canAdvance1() {
    return form.species && form.breed && form.ageNow !== '' && form.ageAcquired !== '';
  }

  function canAdvance2() {
    return form.spendingBucket && form.largestBill && form.incidents.length > 0;
  }

  function canSubmit() {
    return form.hasInsurance !== null;
  }

  function handleSpeciesChange(s: Species) {
    setField('species', s);
    setField('breed', '');
    setBreedSearch('');
  }

  function handleCalculate() {
    if (!form.breed || !form.spendingBucket || !form.largestBill || form.hasInsurance === null) return;
    const input: CalculatorInput = {
      species: form.species,
      breed: form.breed,
      ageNow: parseFloat(form.ageNow) || 0,
      ageAcquired: parseFloat(form.ageAcquired) || 0,
      spendingBucket: form.spendingBucket as SpendingBucket,
      routinePercent: form.routinePercent,
      largestBill: form.largestBill as CalculatorInput['largestBill'],
      incidents: form.incidents,
      hasInsurance: form.hasInsurance,
      wouldBuyAgain: form.wouldBuyAgain || undefined,
    };
    const r = calculate(input);
    setResult(r);
    setSubmitState('idle');
    setTimeout(() => {
      document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  async function handleContribute(r: ReturnType<typeof calculate>) {
    try {
      const payload = {
        species: form.species,
        breed: form.breed,
        age_now_years: parseFloat(form.ageNow) || 0,
        age_acquired_years: parseFloat(form.ageAcquired) || 0,
        state_code: null,
        total_vet_spend_bucket: form.spendingBucket,
        largest_bill_bucket: form.largestBill || null,
        pct_routine: form.routinePercent,
        major_incidents: form.incidents,
        had_insurance: form.hasInsurance ?? false,
        would_buy_again: form.wouldBuyAgain || '',
        verdict: r.verdictBranch,
        verdict_dollars: r.netResult,
      };
      await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // fail silently
    }
    setSubmitState('submitted');
  }

  const incidents = form.species === 'dog' ? DOG_INCIDENTS : CAT_INCIDENTS;

  return (
    <div className="w-full">
      {/* ── Calculator card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Progress bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Step {step} of 3</span>
          <div className="flex gap-2">
            {([1, 2, 3] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full transition-all ${
                  s <= step ? 'bg-teal-700' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* ── Step 1: Your Pet ── */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Pet</h2>

              {/* Species */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Species</label>
                <div className="flex gap-3">
                  <ToggleButton active={form.species === 'dog'} onClick={() => handleSpeciesChange('dog')}>Dog</ToggleButton>
                  <ToggleButton active={form.species === 'cat'} onClick={() => handleSpeciesChange('cat')}>Cat</ToggleButton>
                </div>
              </div>

              {/* Breed */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Breed</label>
                <input
                  type="text"
                  placeholder={`Search ${form.species} breeds...`}
                  value={form.breed || breedSearch}
                  onChange={(e) => {
                    setBreedSearch(e.target.value);
                    setField('breed', '');
                    setShowBreedList(true);
                  }}
                  onFocus={() => setShowBreedList(true)}
                  onBlur={() => setTimeout(() => setShowBreedList(false), 150)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {showBreedList && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredBreeds.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">No breeds found</div>
                    ) : (
                      filteredBreeds.map((b) => (
                        <button
                          key={b.name}
                          type="button"
                          onMouseDown={() => {
                            setField('breed', b.name);
                            setBreedSearch('');
                            setShowBreedList(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 text-gray-800"
                        >
                          {b.name}
                          {'size' in b && (
                            <span className="text-xs text-gray-400 ml-2">{(b as { name: string; size: string }).size}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {form.breed && (
                  <p className="mt-1 text-xs text-gray-500">
                    Selected: <strong>{form.breed}</strong>
                    {selectedBreed && 'lifeExpectancy' in selectedBreed
                      ? ` · Typical lifespan: ${selectedBreed.lifeExpectancy} years`
                      : ''}
                  </p>
                )}
              </div>

              {/* Ages */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current age (years)</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={form.ageNow}
                    onChange={(e) => setField('ageNow', e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age when you got them</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={form.ageAcquired}
                    onChange={(e) => setField('ageAcquired', e.target.value)}
                    placeholder="e.g. 0"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              {form.ageNow && form.ageAcquired && parseFloat(form.ageAcquired) > parseFloat(form.ageNow) && (
                <p className="text-sm text-red-600">Age acquired must be less than or equal to current age.</p>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canAdvance1()}
                  className="px-6 py-2.5 bg-teal-700 text-white rounded-lg font-medium text-sm disabled:opacity-40 hover:bg-teal-800 transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Vet Spending ── */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Vet Spending</h2>
              <p className="text-sm text-gray-500">Estimates are fine — we're looking for ballpark figures, not receipts.</p>

              {/* Total spending */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Total lifetime vet spending for {form.breed || 'your pet'}
                </label>
                <RadioGroup
                  options={SPENDING_OPTIONS}
                  value={form.spendingBucket}
                  onChange={(v) => setField('spendingBucket', v)}
                />
              </div>

              {/* Routine slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  How much of that was routine / wellness care?
                  <span className="ml-2 font-bold text-teal-700">{form.routinePercent}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.routinePercent}
                  onChange={(e) => setField('routinePercent', parseInt(e.target.value))}
                  className="w-full accent-teal-700"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>All routine (checkups, vaccines)</span>
                  <span>All sick / injury</span>
                </div>
              </div>

              {/* Largest single bill */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Largest single vet bill</label>
                <RadioGroup
                  options={BILL_OPTIONS}
                  value={form.largestBill}
                  onChange={(v) => setField('largestBill', v)}
                />
              </div>

              {/* Major incidents */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Major medical incidents (select all that apply)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {incidents.map((inc) => (
                    <label
                      key={inc.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        form.incidents.includes(inc.value)
                          ? 'border-teal-700 bg-teal-50'
                          : 'border-gray-200 bg-white hover:border-teal-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.incidents.includes(inc.value)}
                        onChange={() => toggleIncident(inc.value)}
                        className="accent-teal-700"
                      />
                      <span className="text-sm text-gray-800">{inc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!canAdvance2()}
                  className="px-6 py-2.5 bg-teal-700 text-white rounded-lg font-medium text-sm disabled:opacity-40 hover:bg-teal-800 transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Insurance Status ── */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Insurance Status</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Do you currently have pet insurance for {form.breed || 'your pet'}?
                </label>
                <div className="flex gap-3">
                  <ToggleButton
                    active={form.hasInsurance === true}
                    onClick={() => setField('hasInsurance', true)}
                  >
                    Yes
                  </ToggleButton>
                  <ToggleButton
                    active={form.hasInsurance === false}
                    onClick={() => setField('hasInsurance', false)}
                  >
                    No
                  </ToggleButton>
                </div>
              </div>

              {form.hasInsurance === true && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Would you buy it again?</label>
                  <RadioGroup
                    options={[
                      { value: 'yes' as const,    label: 'Yes' },
                      { value: 'no' as const,     label: 'No' },
                      { value: 'unsure' as const, label: 'Not sure' },
                    ]}
                    value={form.wouldBuyAgain}
                    onChange={(v) => setField('wouldBuyAgain', v)}
                  />
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={!canSubmit()}
                  className="px-8 py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm disabled:opacity-40 hover:bg-amber-700 transition-colors"
                >
                  Calculate →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {result && (
        <div id="results-section" className="mt-10">
          <Verdict
            result={result}
            breed={form.breed}
            species={form.species}
            ageNow={parseFloat(form.ageNow) || 0}
            lifeExpectancy={selectedBreed?.lifeExpectancy ?? (form.species === 'dog' ? 12 : 14)}
            hasInsurance={form.hasInsurance ?? false}
          />

          {/* ── Opt-in data contribution ── */}
          {submitState === 'idle' && (
            <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Help improve this calculator</h3>
              <p className="text-sm text-gray-500 mb-4">
                Your anonymized result can help make this tool more accurate for future pet owners.
                No personal information is stored — just your pet's breed, age, spending range, and the verdict.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleContribute(result)}
                  className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors"
                >
                  Contribute my result
                </button>
                <button
                  type="button"
                  onClick={() => setSubmitState('dismissed')}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                >
                  No thanks
                </button>
              </div>
            </div>
          )}

          {submitState === 'submitted' && (
            <div className="mt-8 bg-teal-50 border border-teal-200 rounded-xl p-5">
              <p className="text-sm font-medium text-teal-800">Thank you — your result has been recorded anonymously.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

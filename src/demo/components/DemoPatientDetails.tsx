import React, { useState } from 'react';
import { UserRound } from 'lucide-react';

interface DemoPatientDetailsProps {
  onStart: (name: string, age: string, sex: string) => void;
}

const SEX_OPTIONS = ['Female', 'Male', 'Intersex', 'Prefer not to say'];

/**
 * Custom Case entry form: collects name, age, and sex before the interview
 * starts so the GP report reflects the actual patient instead of a fictional
 * identity. Every field is optional; blanks are reported as "not provided".
 */
export const DemoPatientDetails: React.FC<DemoPatientDetailsProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');

  const ageInvalid = age.trim() !== '' && (!/^\d{1,3}$/.test(age.trim()) || Number(age) < 1 || Number(age) > 120);

  return (
    <div className="demo-chat-area">
      <div className="demo-chat-empty">
        <form
          className="demo-patient-details"
          onSubmit={(e) => {
            e.preventDefault();
            if (ageInvalid) return;
            onStart(name, age, sex);
          }}
        >
          <div className="demo-patient-details__icon">
            <UserRound size={26} />
          </div>
          <h2 className="demo-patient-details__title">Before we start</h2>
          <p className="demo-patient-details__desc">
            A few details so the clinical briefing reflects you. Everything stays in
            this browser session — nothing is stored or sent anywhere until you type
            a symptom.
          </p>

          <label className="demo-patient-details__field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              maxLength={60}
            />
          </label>

          <div className="demo-patient-details__row">
            <label className="demo-patient-details__field">
              <span>Age</span>
              <input
                type="input"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 34"
                maxLength={3}
                aria-invalid={ageInvalid}
              />
            </label>
            <label className="demo-patient-details__field">
              <span>Sex</span>
              <select value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">Prefer not to say</option>
                {SEX_OPTIONS.filter((s) => s !== 'Prefer not to say').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {ageInvalid && (
            <p className="demo-patient-details__error">Please enter an age between 1 and 120.</p>
          )}

          <button type="submit" className="demo-patient-details__start" disabled={ageInvalid}>
            Start interview
          </button>
        </form>
      </div>
    </div>
  );
};

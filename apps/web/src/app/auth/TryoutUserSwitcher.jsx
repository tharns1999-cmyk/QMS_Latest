import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '../../shared/components/ui/SearchableSelect';
import { apiUrl, setToken } from '../../api/client';

// LOCAL TRYOUT ONLY. Lets a tester move between the seeded accounts without signing out and in again.
// It exists only in a web build made by scripts/local-stack.js (VITE_TRYOUT_SWITCHER=1); every other build leaves the
// flag unset, so nothing below is reachable. It adds no server door: it signs in through the ordinary sign-in with the
// tryout password, which exists only in the seeded local data, and it only lists the people in /tryout-users.json,
// a file the tryout writes next to the web app.
export const TRYOUT_SWITCHER = import.meta.env.VITE_TRYOUT_SWITCHER === '1';
const TRYOUT_PASSWORD = '1234';

const TryoutUserSwitcher = ({ currentId }) => {
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/tryout-users.json')
      .then((res) => (res.ok ? res.json() : []))
      .then(setPeople, () => setPeople([]));
  }, []);

  const options = useMemo(
    () => people.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.department}) L${p.level}`,
      subLabel: p.position || null,
      badge: p.department,
      keywords: [p.name, p.department, `L${p.level}`, p.position, p.email].filter(Boolean)
    })),
    [people]
  );

  const switchTo = async (id) => {
    const person = people.find((p) => p.id === id);
    if (!person || id === currentId) return;
    setError('');
    try {
      // A plain request, not the app's client: a refused sign-in must not sign out the person already in.
      const res = await fetch(apiUrl('/api/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: person.email, password: TRYOUT_PASSWORD }) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error || `เข้าสู่ระบบไม่สำเร็จ (${res.status})`);
        return;
      }
      if (!result.token) {
        setError('บัญชีนี้ต้องยืนยันสองขั้นตอน สลับจากตรงนี้ไม่ได้');
        return;
      }
      setToken(result.token);
      // A fresh start for the new person: nothing of the previous one's screens or data is carried over.
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!people.length) return null;
  return (
    <div className="space-y-1">
      <SearchableSelect
        size="sm"
        value={currentId || ''}
        onChange={switchTo}
        options={options}
        placeholder="สลับผู้ใช้ (ทดลองในเครื่อง)..."
        ariaLabel="สลับผู้ใช้ทดลองในเครื่อง"
        title="สลับผู้ใช้ทดลองในเครื่อง (ไม่มีในระบบจริง)"
        autoFlip={true}
      />
      {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
};

export default TryoutUserSwitcher;

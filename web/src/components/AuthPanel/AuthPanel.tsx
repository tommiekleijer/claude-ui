import { FormEvent, useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { cancelLogin, closeAuth, send, startLogin, useApp, useStore } from '../../store';
import { Knop, Schakelaar, Segmentbalk } from '../../vertex';
import { Row } from '../SettingsPage/SettingsPage';
import settings from '../SettingsPage/SettingsPage.module.scss';
import Dialog from '../ui/Dialog';
import styles from './AuthPanel.module.scss';

const LoginForm = () => {
  const [methode, setMethode] = useState('claudeai');
  const [sso, setSso] = useState(false);
  const [email, setEmail] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startLogin({ console: methode === 'console', sso, email: email.trim() });
  };

  return (
    <form onSubmit={submit}>
      <Row label="Account">
        <Segmentbalk
          label="Account"
          opties={[
            { waarde: 'claudeai', label: 'Claude-abonnement' },
            { waarde: 'console', label: 'Console (API)' },
          ]}
          waarde={methode}
          onKies={setMethode}
        />
      </Row>
      <Row label="SSO" hint="Inloggen via de single sign-on van je organisatie.">
        <Schakelaar aria-label="SSO" aan={sso} onChange={(event) => setSso(event.target.checked)} />
      </Row>
      <Row label="E-mail" hint="Optioneel; wordt alvast ingevuld op de inlogpagina.">
        <input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="E-mail" />
      </Row>
      <div className={styles.actions}>
        <Knop variant="primair" icoon={<LogIn size={16} />} type="submit">
          Inloggen
        </Knop>
      </div>
    </form>
  );
};

const Waiting = ({ url }: { url?: string }) => {
  const [code, setCode] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send({ type: 'auth_code', code });
    setCode('');
  };

  return (
    <>
      <p className={styles.status}>Wachten op de browser…</p>
      {url && (
        <form className={styles.fallback} onSubmit={submit}>
          <p className={settings.hint}>
            Opent de browser niet?{' '}
            <a href={url} target="_blank" rel="noreferrer">
              Open de inlogpagina
            </a>{' '}
            en plak hier de code die je daarna krijgt.
          </p>
          <div className={styles.codeRow}>
            <input className={styles.input} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" aria-label="Code" />
            <Knop maat="s" type="submit" disabled={!code.trim()}>
              Versturen
            </Knop>
          </div>
        </form>
      )}
      <div className={styles.actions}>
        <Knop variant="tertiair" onClick={cancelLogin}>
          Annuleren
        </Knop>
      </div>
    </>
  );
};

const AuthPanel = () => {
  const status = useApp((s) => s.authStatus);
  const login = useApp((s) => s.authLogin);
  const model = useStore((s) => s.model);
  const permissionMode = useStore((s) => s.permissionMode);
  const cwd = useStore((s) => s.cwd);
  const sessionId = useStore((s) => s.sessionId);
  const mcp = useStore((s) => s.manage?.mcp) ?? [];

  const methode = status?.authMethod === 'claude.ai' ? `Claude-abonnement${status.subscriptionType ? ` (${status.subscriptionType})` : ''}` : status?.authMethod;

  return (
    <Dialog
      onClose={closeAuth}
      title={
        <>
          <UserRound size={20} />
          Account
        </>
      }
    >
      <section className={settings.section}>
        {!status && <p className={settings.hint}>Laden…</p>}
        {login?.state === 'waiting' && <Waiting url={login.url} />}
        {login?.state !== 'waiting' && status?.loggedIn && (
          <Row label={`Ingelogd als ${status.email ?? '-'}`} hint={[status.orgName, methode].filter(Boolean).join(' · ')}>
            <Knop variant="destructief" maat="s" icoon={<LogOut size={14} />} onClick={() => send({ type: 'auth_logout' })}>
              Uitloggen
            </Knop>
          </Row>
        )}
        {login?.state !== 'waiting' && status && !status.loggedIn && (
          <>
            {status.error && <p className={styles.error}>Status ophalen mislukt: {status.error}</p>}
            {login?.state === 'failed' && <p className={styles.error}>{login.error}</p>}
            <LoginForm />
          </>
        )}
      </section>
      <section className={settings.section}>
        <h3 className={settings.heading}>Sessie</h3>
        <dl className={styles.info}>
          <dt>Model</dt>
          <dd>{model ?? 'standaard'}</dd>
          <dt>Modus</dt>
          <dd>{permissionMode ?? '-'}</dd>
          <dt>Map</dt>
          <dd>{cwd ?? '-'}</dd>
          {sessionId && (
            <>
              <dt>Sessie</dt>
              <dd>{sessionId.slice(0, 8)}</dd>
            </>
          )}
          {mcp.length > 0 && (
            <>
              <dt>MCP</dt>
              <dd>
                {mcp.filter((m) => m.status === 'connected').length}/{mcp.length} verbonden
              </dd>
            </>
          )}
        </dl>
      </section>
    </Dialog>
  );
};

export default AuthPanel;

import { TriangleAlert } from 'lucide-react';
import styles from './App.module.scss';
import { ChatArea } from './components/ChatView/ChatView';
import Composer from './components/Composer/Composer';
import ManagePanel from './components/ManagePanel/ManagePanel';
import QuestionDialog from './components/QuestionDialog/QuestionDialog';
import TerminalDialog from './components/TerminalDialog/TerminalDialog';
import Notices from './components/Notices/Notices';
import PermissionPopup from './components/PermissionPopup/PermissionPopup';
import ProjectPicker from './components/ProjectPicker/ProjectPicker';
import SessionSidebar from './components/SessionSidebar/SessionSidebar';
import StatusBar from './components/StatusBar/StatusBar';
import SubagentDialog from './components/SubagentDialog/SubagentDialog';
import TasksPanel from './components/TasksPanel/TasksPanel';
import SettingsPage from './components/SettingsPage/SettingsPage';
import UsagePanel from './components/UsagePanel/UsagePanel';
import TabBar from './components/TabBar/TabBar';
import { useStore } from './store';

const App = () => {
  const apiKeyPresent = useStore((s) => s.apiKeyPresent);
  const apiKeySource = useStore((s) => s.apiKeySource);
  const pickerOpen = useStore((s) => s.pickerOpen);
  const manageOpen = useStore((s) => s.manageOpen);
  const usageOpen = useStore((s) => s.usageOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const terminalDocked = useStore((s) => s.terminals.length > 0 && s.terminalMinimized);
  const hasPermission = useStore((s) => s.permissions.length > 0);
  const apiKeyInUse = apiKeySource !== null && apiKeySource !== 'none';

  return (
    <div className={styles.app}>
      <TabBar />
      <div className={terminalDocked ? `${styles.body} ${styles.withDock}` : styles.body}>
        {sidebarOpen && <SessionSidebar />}
        <main className={styles.main}>
          {(apiKeyPresent || apiKeyInUse) && (
            <div className={styles.warning} role="alert">
              <TriangleAlert size={14} />
              {apiKeyInUse
                ? `Claude Code gebruikt een API-key (${apiKeySource}) in plaats van je abonnement; dit wordt per token afgerekend.`
                : 'ANTHROPIC_API_KEY stond in de omgeving van de backend. De app negeert hem en gebruikt je abonnement; haal hem weg uit je omgeving.'}
            </div>
          )}
          <ChatArea />
          <TasksPanel />
          <Composer />
        </main>
      </div>
      <StatusBar />
      {pickerOpen && <ProjectPicker />}
      {manageOpen && <ManagePanel />}
      {usageOpen && <UsagePanel />}
      {settingsOpen && <SettingsPage />}
      <SubagentDialog />
      {hasPermission && <PermissionPopup />}
      <QuestionDialog />
      <TerminalDialog />
      <Notices />
    </div>
  );
};

export default App;

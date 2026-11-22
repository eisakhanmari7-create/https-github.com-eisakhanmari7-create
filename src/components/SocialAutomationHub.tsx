import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Send,
  ExternalLink,
  Sparkles,
  Trash2,
  Check,
  X,
  Video,
  Image as ImageIcon,
  Settings,
  FolderCheck,
  HardDrive,
  LogOut,
  Eye,
  ShieldCheck,
  HelpCircle,
  Activity,
  FolderPlus,
  Zap,
  Copy,
  Play,
} from 'lucide-react';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  fetchReadyToPostFiles,
  checkDriveTokenValid,
  DriveMediaFile,
  READY_TO_POST_IMAGES_FOLDER_ID,
  READY_TO_POST_IMAGES_FOLDER_NAME,
  READY_TO_POST_VIDEO_FOLDER_ID,
  READY_TO_POST_VIDEO_FOLDER_NAME,
  READY_TO_POST_FOLDER_ID,
  READY_TO_POST_FOLDER_NAME,
  READY_TO_POST_FOLDER_URL,
  getCachedAccessToken,
} from '../utils/googleDriveAuth';

// Helper: Check if a file's createdTime is today in Asia/Karachi timezone (Requirement 1)
export function isCreatedTodayInKarachi(isoDateString?: string): boolean {
  if (!isoDateString) return false;
  try {
    const fileKarachiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(isoDateString));
    const todayKarachiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    return fileKarachiDate === todayKarachiDate;
  } catch {
    return false;
  }
}

// Helper: Extract Google Drive Folder ID from a URL or raw ID
export function extractDriveFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return trimmed;
}

export interface SocialSettingsData {
  autoMode?: boolean;
  dailyLimit?: number;
  todayDispatchedCount?: number;
  todayDispatchedDate?: string;
  sendBothPlatforms?: boolean;
  makeWebhookUrl: string;
  makeStatus?: 'DISCONNECTED' | 'CONNECTED' | 'TEST SUCCESSFUL' | 'FAILED';
  makeLastTestedAt?: string;
  dispatchedFileIds?: string[];
  schedule?: {
    time1?: string;
    time2?: string;
    dailyLimit?: number;
    lastDispatchedSlot?: string;
  };
  dispatchLogs?: DispatchLogItem[];
  isPaused: boolean;
  driveFolder: {
    folderName: string;
    folderId: string;
  };
  imageFolder?: {
    folderName: string;
    folderId: string;
    folderUrl?: string;
  };
  videoFolder?: {
    folderName: string;
    folderId: string;
    folderUrl?: string;
  };
  googleDriveAuth?: {
    connected: boolean;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    userEmail?: string;
    userName?: string;
    savedAt?: string;
  };
}

export interface PreviewPostCard {
  id: string;
  fileId: string;
  fileName: string;
  driveUrl: string;
  thumbnailLink?: string;
  webViewLink?: string;
  createdTime: string;
  contentType: 'image' | 'video';
  headline: string;
  caption: string;
  hashtags: string[];
  isGeneratingAi?: boolean;
  status: 'READY TO POST' | 'NEEDS APPROVAL' | 'SENT TO MAKE' | 'FAILED';
  isPreviouslyDispatched: boolean;
  transcribedText?: string;
  approvalNote?: string;
}

export interface DispatchLogItem {
  id: string;
  fileId?: string;
  fileName: string;
  platform: string;
  caption?: string;
  scheduledTime?: string;
  statusText: string;
  status?: 'READY' | 'NEEDS_APPROVAL' | 'QUEUED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'PAUSED';
  success: boolean;
  timestamp: string;
  error?: string;
}

export interface DispatchReport {
  success: boolean;
  httpStatus: number;
  results: Array<{
    fileName: string;
    fileId: string;
    platform: string;
    success: boolean;
    httpStatus: number;
    statusText: string;
    responseBody: string;
    payloadSent: any;
    errorMessage?: string;
  }>;
}

export interface SocialAutomationHubProps {
  initialSection?: 'dashboard' | 'automation' | 'history' | 'settings';
  openSettingsTrigger?: number;
}

export const SocialAutomationHub: React.FC<SocialAutomationHubProps> = ({
  initialSection,
  openSettingsTrigger,
}) => {
  // Settings & System State
  const [settings, setSettings] = useState<SocialSettingsData>({
    autoMode: false,
    dailyLimit: 3,
    todayDispatchedCount: 0,
    sendBothPlatforms: true,
    makeWebhookUrl: '',
    makeStatus: 'DISCONNECTED',
    dispatchedFileIds: [],
    dispatchLogs: [],
    isPaused: false,
    driveFolder: {
      folderName: READY_TO_POST_FOLDER_NAME,
      folderId: READY_TO_POST_FOLDER_ID,
    },
    imageFolder: {
      folderName: READY_TO_POST_FOLDER_NAME,
      folderId: READY_TO_POST_FOLDER_ID,
      folderUrl: READY_TO_POST_FOLDER_URL,
    },
    videoFolder: {
      folderName: READY_TO_POST_FOLDER_NAME,
      folderId: READY_TO_POST_FOLDER_ID,
      folderUrl: READY_TO_POST_FOLDER_URL,
    },
  });

  // Google Drive Genuine Connection State
  const [driveToken, setDriveToken] = useState<string | null>(() => getCachedAccessToken());
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);
  const [isAuthorizingDrive, setIsAuthorizingDrive] = useState<boolean>(false);
  const [driveUser, setDriveUser] = useState<any | null>(null);

  // Content Selection Controls (Image, Video, Both + Quantity)
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | 'both'>('image');
  const [selectedCount, setSelectedCount] = useState<number>(1);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(false);
  const [customCountInput, setCustomCountInput] = useState<number>(4);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook']);

  // Copy / Save card feedback state
  const [copiedCaptionId, setCopiedCaptionId] = useState<string | null>(null);
  const [copiedTagsId, setCopiedTagsId] = useState<string | null>(null);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);

  // Real Drive Preview Items (NO fake/mock data)
  const [previewItems, setPreviewItems] = useState<PreviewPostCard[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewLoadedType, setPreviewLoadedType] = useState<'image' | 'video' | 'both' | null>(null);

  // Confirmation Modal Before Dispatch
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isDispatchingNow, setIsDispatchingNow] = useState<boolean>(false);

  // Settings Modal with Individual Tabs
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'folders' | 'schedule' | 'drive' | 'make' | 'facebook' | 'tiktok' | 'storage'>('folders');
  const [makeUrlInput, setMakeUrlInput] = useState<string>('');
  const [imageFolderInput, setImageFolderInput] = useState<string>(READY_TO_POST_FOLDER_URL);
  const [videoFolderInput, setVideoFolderInput] = useState<string>(READY_TO_POST_FOLDER_URL);
  const [scheduleTime1, setScheduleTime1] = useState<string>('08:00 AM');
  const [scheduleTime2, setScheduleTime2] = useState<string>('02:00 PM');
  const [scheduleTime3, setScheduleTime3] = useState<string>('06:00 PM');
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(3);
  const [hasCheckedTodayFiles, setHasCheckedTodayFiles] = useState<boolean>(false);
  const [refreshTokenInput, setRefreshTokenInput] = useState<string>('');
  const [clientIdInput, setClientIdInput] = useState<string>('');
  const [clientSecretInput, setClientSecretInput] = useState<string>('');
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [isRefreshingDriveToken, setIsRefreshingDriveToken] = useState<boolean>(false);
  const [webhookTestMessage, setWebhookTestMessage] = useState<string | null>(null);

  // Dispatch Result Banner & Full JSON Report
  const [lastDispatchReport, setLastDispatchReport] = useState<DispatchReport | null>(null);
  const [shareSuccessBanner, setShareSuccessBanner] = useState<{
    msg: string;
    details: Array<{ fileName: string; platform: string; status: string; success: boolean }>;
  } | null>(null);
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLogItem[]>([]);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // GNZEE Social Hub Connectors System (Permanent Server-Backed State)
  const [connectors, setConnectors] = useState<Array<{
    id: string;
    n: string;
    c: string;
    l: string;
    u: string;
    status: 'on' | 'wait' | 'off';
    account?: string;
  }>>([
    { id: "drive", n: "Google Drive", c: "#1a73e8", l: "D", u: "https://drive.google.com", status: "off" },
    { id: "facebook", n: "Facebook Page", c: "#1877f2", l: "f", u: "https://www.facebook.com/login", status: "off" },
    { id: "youtube", n: "YouTube", c: "#d93025", l: "Y", u: "https://studio.youtube.com", status: "off" },
    { id: "instagram", n: "Instagram", c: "#c13584", l: "I", u: "https://www.instagram.com/accounts/login/", status: "off" },
    { id: "tiktok", n: "TikTok", c: "#222", l: "T", u: "https://www.tiktok.com/login", status: "off" },
  ]);
  const [makeSaveMsg, setMakeSaveMsg] = useState<string>('');

  // Live Pakistan Time
  const [livePakistanTime, setLivePakistanTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })
  );

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLivePakistanTime(
        new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })
      );
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Respond to external Settings trigger from top navigation
  useEffect(() => {
    if (openSettingsTrigger && openSettingsTrigger > 0) {
      setShowSettingsModal(true);
    }
  }, [openSettingsTrigger]);

  // Helper: Open settings modal with a specific tab
  const openSettingsWithTab = (tab: 'folders' | 'schedule' | 'drive' | 'make' | 'facebook' | 'tiktok' | 'storage') => {
    setSettingsTab(tab);
    setShowSettingsModal(true);
  };

  // 1. Fetch initial settings & verify server state
  const fetchSettings = useCallback(async () => {
    try {
      // 1.1 Load Settings from server
      const res = await fetch('/api/social/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
          setMakeUrlInput(data.settings.makeWebhookUrl || '');
          if (data.settings.imageFolder) {
            setImageFolderInput(data.settings.imageFolder.folderUrl || `https://drive.google.com/drive/folders/${data.settings.imageFolder.folderId}`);
          }
          if (data.settings.videoFolder) {
            setVideoFolderInput(data.settings.videoFolder.folderUrl || `https://drive.google.com/drive/folders/${data.settings.videoFolder.folderId}`);
          }
          if (data.settings.schedule) {
            if (data.settings.schedule.time1) setScheduleTime1(data.settings.schedule.time1);
            if (data.settings.schedule.time2) setScheduleTime2(data.settings.schedule.time2);
            if (data.settings.schedule.time3) setScheduleTime3(data.settings.schedule.time3);
            if (typeof data.settings.schedule.dailyLimit === 'number') setDailyLimitInput(data.settings.schedule.dailyLimit);
          } else if (typeof data.settings.dailyLimit === 'number') {
            setDailyLimitInput(data.settings.dailyLimit);
          }
          if (Array.isArray(data.settings.dispatchLogs)) {
            setDispatchLogs(data.settings.dispatchLogs);
          }
          if (data.settings.googleDriveAuth?.refreshToken) {
            setRefreshTokenInput(data.settings.googleDriveAuth.refreshToken);
          }
          if (data.settings.googleDriveAuth?.clientId) {
            setClientIdInput(data.settings.googleDriveAuth.clientId);
          }
          if (data.settings.googleDriveAuth?.clientSecret) {
            setClientSecretInput(data.settings.googleDriveAuth.clientSecret);
          }
        }
      }

      // 1.2 Load Connectors from server (Permanent status across reloads & sessions)
      try {
        const connRes = await fetch('/api/social/connectors');
        if (connRes.ok) {
          const connData = await connRes.json();
          if (Array.isArray(connData.connectors)) {
            setConnectors(connData.connectors);
            const drv = connData.connectors.find((c: any) => c.id === 'drive');
            if (drv?.status === 'on') {
              setIsDriveConnected(true);
            }
          }
          if (connData.makeWebhookUrl) {
            setMakeUrlInput(connData.makeWebhookUrl);
            setSettings((prev) => ({
              ...prev,
              makeWebhookUrl: connData.makeWebhookUrl,
              makeStatus: connData.makeStatus || 'CONNECTED',
            }));
          }
        }
      } catch (cErr) {
        console.warn('Connectors load error:', cErr);
      }

      // 1.3 Check Drive auth saved on server (Never drops isConnected on simple page reload)
      const authRes = await fetch('/api/social/drive-auth');
      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData?.auth?.connected) {
          setIsDriveConnected(true);
          if (authData.auth.accessToken) {
            setDriveToken(authData.auth.accessToken);
          }
          setDriveUser({
            email: authData.auth.userEmail || 'eisakhanmari7@gmail.com',
            displayName: authData.auth.userName || 'Connected User',
          });
        }
      }
    } catch (err) {
      console.warn('Settings load error:', err);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Connector Actions Handler (Matches GNZEE Social Hub spec)
  const updateConnectorStatus = async (id: string, newStatus: 'on' | 'wait' | 'off') => {
    setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
    try {
      await fetch('/api/social/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
    } catch (e) {
      console.warn('Failed to update connector on server:', e);
    }
  };

  const handleConnectorAction = async (item: {
    id: string;
    n: string;
    c: string;
    l: string;
    u: string;
    status: 'on' | 'wait' | 'off';
  }) => {
    if (item.id === 'drive') {
      if (item.status === 'on' || isDriveConnected) {
        await logoutGoogle();
        setIsDriveConnected(false);
        setDriveToken(null);
        await updateConnectorStatus('drive', 'off');
        showToast('Google Drive disconnected.');
      } else {
        setIsAuthorizingDrive(true);
        try {
          const res = await googleSignIn();
          if (!res) {
            showToast('Google لاگ ان ونڈو بند ہو گئی۔ دوبارہ Connect پر کلک کریں۔');
            return;
          }
          if (res?.accessToken) {
            setDriveToken(res.accessToken);
            setDriveUser({
              email: res.user.email || 'eisakhanmari7@gmail.com',
              displayName: res.user.displayName || 'GNZEE User',
            });
            if (res.folderAccessible) {
              setIsDriveConnected(true);
              await updateConnectorStatus('drive', 'on');
              showToast('Google Drive successfully connected!');
            } else {
              setIsDriveConnected(false);
              await updateConnectorStatus('drive', 'off');
              showToast(
                'Google لاگ ان ہو گیا لیکن Drive کی اجازت (✓ Checkbox) نہیں ملی۔ دوبارہ Connect دبا کر Google Drive کے خانے پر ٹک (✓) ضرور لگائیں۔',
                true
              );
            }
          }
        } catch (err: any) {
          showToast('Google Drive connection error: ' + (err?.message || err), true);
        } finally {
          setIsAuthorizingDrive(false);
        }
      }
      return;
    }

    // Facebook, YouTube, Instagram, TikTok Connectors
    if (item.status === 'off') {
      window.open(item.u, '_blank', 'noopener,noreferrer');
      await updateConnectorStatus(item.id, 'wait');
      showToast(`${item.n} login opened in a new tab. After signing in, click "I've signed in" to confirm.`);
    } else if (item.status === 'wait') {
      await updateConnectorStatus(item.id, 'on');
      showToast(`${item.n} connected successfully!`);
      if (item.id === 'facebook' && !selectedPlatforms.includes('facebook')) {
        setSelectedPlatforms((prev) => [...prev, 'facebook']);
      }
    } else {
      await updateConnectorStatus(item.id, 'off');
      showToast(`${item.n} disconnected.`);
    }
  };

  const handleSaveMakeUrlFromHub = async () => {
    const url = makeUrlInput.trim();
    try {
      const res = await fetch('/api/social/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hookUrl: url }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          makeWebhookUrl: url,
          makeStatus: url ? 'CONNECTED' : 'DISCONNECTED',
        }));
        setMakeSaveMsg('Saved');
        setTimeout(() => setMakeSaveMsg(''), 2500);
        showToast('Make webhook URL saved successfully on server!');
      }
    } catch (err: any) {
      showToast('Failed to save webhook URL: ' + (err?.message || err), true);
    }
  };

  // Auto-refresh Google Drive access token using stored refresh token
  const handleRefreshDriveToken = async () => {
    setIsRefreshingDriveToken(true);
    try {
      const res = await fetch('/api/social/drive-refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: refreshTokenInput.trim(),
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.accessToken) {
        setDriveToken(data.accessToken);
        setIsDriveConnected(true);
        showToast('Google Drive access token refreshed successfully!');
      } else {
        showToast(data.error || 'Token refresh failed.', true);
      }
    } catch (err: any) {
      showToast('Token refresh network error: ' + (err?.message || ''), true);
    } finally {
      setIsRefreshingDriveToken(false);
    }
  };

  // Check Drive token on start without wiping server-persisted connection state
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setDriveUser(user);
        setIsDriveConnected(true);
        if (token) {
          const check = await checkDriveTokenValid(token, READY_TO_POST_FOLDER_ID);
          if (check.folderAccessible) {
            setDriveToken(token);
          } else {
            // Try silent server refresh if token expired
            try {
              const refreshRes = await fetch('/api/social/drive-refresh-token', { method: 'POST' });
              if (refreshRes.ok) {
                const refreshed = await refreshRes.json();
                if (refreshed.accessToken) {
                  setDriveToken(refreshed.accessToken);
                }
              }
            } catch {
              // Keep connected state from server; user can click Reconnect if needed
            }
          }
        }
      },
      () => {
        // Only clear if server also confirmed disconnected
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Connect Google Drive with real OAuth popup
  const handleConnectGoogleDrive = async () => {
    setIsAuthorizingDrive(true);
    try {
      const res = await googleSignIn();
      if (!res) {
        showToast('Google لاگ ان ونڈو بند ہو گئی۔ کنیکٹ کرنے کے لیے دوبارہ کلک کریں۔');
        return;
      }
      if (res && res.accessToken) {
        if (res.folderAccessible) {
          setDriveToken(res.accessToken);
          setDriveUser(res.user);
          setIsDriveConnected(true);
          showToast('Google Drive کامیابی سے منسلک ہو گیا اور Ready to Post فولڈر کی تصدیق ہو گئی!');
          await loadRealDrivePreview(res.accessToken, selectedMediaType, selectedCount);
        } else {
          setIsDriveConnected(false);
          showToast(`Google لاگ ان ہو گیا لیکن Ready to Post فولڈر تک رسائی ممکن نہیں: ${res.error || 'اجازت درکار ہے'}`, true);
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Access cancelled';
      if (errMsg.includes('popup-closed-by-user') || err?.code === 'auth/popup-closed-by-user') {
        showToast('لاگ ان ونڈو بند کر دی گئی۔');
      } else {
        console.warn('Google Drive sign-in notice:', errMsg);
        showToast('Drive Sign-in failed: ' + errMsg, true);
      }
    } finally {
      setIsAuthorizingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await logoutGoogle();
    setDriveToken(null);
    setDriveUser(null);
    setIsDriveConnected(false);
    setPreviewItems([]);
    showToast('Google Drive disconnected.');
  };

  // 3. Toggle Master Automation Switch (ON / OFF)
  const handleToggleMasterSwitch = async () => {
    const targetState = !settings.autoMode;
    try {
      const res = await fetch('/api/social/auto/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoMode: targetState }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, autoMode: targetState }));
        showToast(targetState ? '⚡ Master Automation Switch is now ON' : 'Master Automation Switch turned OFF');
      }
    } catch (err: any) {
      showToast('Error toggling switch: ' + (err?.message || ''), true);
    }
  };

  // 4. Load Real Drive Files and generate Gemini metadata (NO mock/demo files!)
  const loadRealDrivePreview = async (
    tokenToUse?: string,
    mediaType = selectedMediaType,
    count = selectedCount
  ) => {
    let token = tokenToUse || driveToken;
    if (!token) {
      // Attempt to pull or refresh token from server before failing
      try {
        const authRes = await fetch('/api/social/drive-auth');
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData?.auth?.accessToken) {
            token = authData.auth.accessToken;
            setDriveToken(token);
          }
        }
      } catch {
        // ignore
      }
    }

    if (!token) {
      showToast('Google Drive کا نیا ٹوکن درکار ہے۔ براہ کرم Google Drive کارڈ پر Connect دبائیں۔', true);
      return;
    }

    const folderId = settings.driveFolder?.folderId || settings.imageFolder?.folderId || READY_TO_POST_FOLDER_ID;

    setIsLoadingPreview(true);
    setHasCheckedTodayFiles(true);
    try {
      let files: DriveMediaFile[];
      try {
        files = await fetchReadyToPostFiles(token, folderId, mediaType);
      } catch (firstErr: any) {
        const firstMsg = String(firstErr?.message || '');
        if (firstMsg.includes('401')) {
          const refreshRes = await fetch('/api/social/drive-refresh-token', { method: 'POST' });
          if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            if (typeof refreshed.accessToken === 'string' && refreshed.accessToken) {
              const refreshedToken: string = refreshed.accessToken;
              token = refreshedToken;
              setDriveToken(refreshedToken);
              files = await fetchReadyToPostFiles(refreshedToken, folderId, mediaType);
            } else {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }
      // Sort newest first by createdTime
      const sorted = [...files].sort(
        (a, b) => new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime()
      );

      // Pick available unposted files from Ready to Post (prioritize today's, but fallback to latest available!)
      const dispatched = settings.dispatchedFileIds || [];
      const unpostedFiles = sorted.filter((f) => !dispatched.includes(f.id));
      const todayFiles = unpostedFiles.filter((f) => isCreatedTodayInKarachi(f.createdTime));
      const candidateFiles = todayFiles.length > 0 ? todayFiles : unpostedFiles;

      if (candidateFiles.length === 0) {
        setPreviewItems([]);
        setPreviewLoadedType(mediaType);
        if (sorted.length === 0) {
          showToast('Ready to Post فولڈر خالی ہے (کوئی تصویر یا ویڈیو نہیں ملی)۔');
        } else {
          showToast('Ready to Post فولڈر کی تمام فائلیں پہلے ہی Make کو بھیجی جا چکی ہیں (کوئی نئی فائل باقی نہیں)۔');
        }
        return;
      }

      const targetFiles = candidateFiles.slice(0, count);

      // Generate Gemini caption & hashtags for each file using Gemini Vision OCR
      const loadedCards: PreviewPostCard[] = [];
      for (const f of targetFiles) {
        const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const isPreviouslyDispatched = (settings.dispatchedFileIds || []).includes(f.id);

        let imageBase64: string | undefined = undefined;
        let localPreviewUrl: string | undefined = undefined;

        // Fetch image blob directly from Google Drive using fresh OAuth token for high-res preview & Gemini Vision
        if (f.type === 'image' && token && f.id) {
          try {
            const imgRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              localPreviewUrl = URL.createObjectURL(blob);
              imageBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch (bErr) {
            console.warn('Could not load image blob for vision:', bErr);
          }
        }

        let genHeadline = '✨ خوبصورت پیغام اور پرحکمت سوچ';
        let genCaption = `✨ ${cleanName} — اس خوبصورت پیغام کو پڑھیں اور اپنی زندگی میں مثبت تبدیلی لائیں۔ 🌸`;
        let genHashtags = ['#GNZEEMarket', '#UrduQuotes', '#DailyWisdom', '#Pakistan', '#Inspiration'];
        let genTranscribed = '';
        let cardStatus: 'READY TO POST' | 'NEEDS APPROVAL' = 'READY TO POST';
        let approvalNote = '';

        try {
          const aiRes = await fetch('/api/social/generate-post-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: cleanName,
              platform: selectedPlatforms[0] || 'facebook',
              contentType: mediaType,
              imageBase64,
              thumbnailLink: f.thumbnailLink,
              fileId: f.id,
              fileUrl: f.webViewLink,
              accessToken: token,
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (aiData.headline) genHeadline = aiData.headline;
            if (aiData.caption) genCaption = aiData.caption;
            if (Array.isArray(aiData.hashtags) && aiData.hashtags.length > 0) genHashtags = aiData.hashtags;
            if (aiData.transcribedText) genTranscribed = aiData.transcribedText;
            if (aiData.status === 'NEEDS APPROVAL') {
              cardStatus = 'NEEDS APPROVAL';
              approvalNote = aiData.approvalNote || 'اردو متن کی جانچ درکار ہے';
            }
          }
        } catch (aiErr) {
          console.warn('AI caption generation fallback:', aiErr);
        }

        loadedCards.push({
          id: f.id,
          fileId: f.id,
          fileName: f.name,
          driveUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          thumbnailLink: localPreviewUrl || f.thumbnailLink,
          webViewLink: f.webViewLink,
          createdTime: f.createdTime,
          contentType: f.type === 'video' ? 'video' : 'image',
          headline: genHeadline,
          caption: genCaption,
          hashtags: genHashtags,
          status: cardStatus,
          isPreviouslyDispatched,
          transcribedText: genTranscribed,
          approvalNote,
        });
      }

      setPreviewItems(loadedCards);
      setPreviewLoadedType(mediaType);
      showToast(`Loaded ${loadedCards.length} latest ${mediaType} file(s) from Google Drive.`);
    } catch (err: any) {
      const msg = err?.message || '';
      console.warn('Real drive preview notice:', msg);
      if (
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('expired') ||
        msg.includes('insufficient') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('Insufficient Permission')
      ) {
        setIsDriveConnected(false);
        setDriveToken(null);
        showToast('Google Drive کی اجازت درکار ہے۔ براہ کرم "Connect OAuth" یا Settings میں دوبارہ کنیکٹ کریں۔', true);
      } else {
        showToast('Google Drive سے فائلیں لانے میں خرابی: ' + msg, true);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // 5. Re-generate single card caption with Gemini Vision
  const handleRegenerateCardCaption = async (cardId: string) => {
    const card = previewItems.find((c) => c.id === cardId);
    if (!card) return;

    setPreviewItems((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isGeneratingAi: true } : c))
    );

    try {
      const cleanName = card.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      const res = await fetch('/api/social/generate-post-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: cleanName,
          platform: selectedPlatforms[0] || 'facebook',
          contentType: card.contentType,
          thumbnailLink: card.thumbnailLink,
          fileId: card.fileId,
          fileUrl: card.driveUrl,
          accessToken: driveToken,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewItems((prev) =>
          prev.map((c) => {
            if (c.id === cardId) {
              return {
                ...c,
                headline: data.headline || c.headline,
                caption: data.caption || c.caption,
                hashtags: Array.isArray(data.hashtags) ? data.hashtags : c.hashtags,
                isGeneratingAi: false,
                status: data.status === 'NEEDS APPROVAL' ? 'NEEDS APPROVAL' : 'READY TO POST',
                transcribedText: data.transcribedText || c.transcribedText,
                approvalNote: data.approvalNote || '',
              };
            }
            return c;
          })
        );
        showToast('✨ Vision analysis complete! Caption updated based on image content.');
      }
    } catch (err: any) {
      showToast('Caption generation failed: ' + (err?.message || ''), true);
      setPreviewItems((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, isGeneratingAi: false } : c))
      );
    }
  };

  // 6. Platform selection toggles (Facebook, Instagram, YouTube, TikTok)
  const togglePlatform = (plat: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(plat) ? (prev.length > 1 ? prev.filter((p) => p !== plat) : prev) : [...prev, plat]
    );
  };

  // 7. Click Share Now -> Validations -> Open Confirmation Modal
  const handleShareNowClick = () => {
    // A. Platform Check
    if (selectedPlatforms.length === 0) {
      showToast('Please select at least one active platform (Facebook, Instagram, YouTube, or TikTok).', true);
      return;
    }

    // C. Preview Check
    if (previewItems.length === 0) {
      showToast('Please click "Show Preview" to load real files from Google Drive first.', true);
      return;
    }

    // D. Auto-populate empty captions with authentic Urdu fallback so user is never blocked
    setPreviewItems((prev) =>
      prev.map((p) => ({
        ...p,
        caption: (p.caption && p.caption.trim())
          ? p.caption
          : `✨ خوبصورت پیغام اور پرحکمت سوچ — اس پیغام کو پڑھیں اور اپنی زندگی میں مثبت تبدیلی لائیں۔ 🌸`,
      }))
    );

    // E. If Master Switch was OFF, enable it automatically
    if (!settings.autoMode) {
      setSettings((prev) => ({ ...prev, autoMode: true }));
    }

    // Open Confirmation Dialog ("تصدیقی ونڈو")
    setShowConfirmModal(true);
  };

  // 8. Confirm Dispatch -> Direct Send to Make Webhook (Mirrors Test Webhook)
  const handleExecuteShareNow = async () => {
    setShowConfirmModal(false);
    setIsDispatchingNow(true);
    setShareSuccessBanner(null);
    setLastDispatchReport(null);

    const payloadItems = previewItems.map((p) => ({
      fileName: p.fileName,
      fileId: p.fileId,
      fileUrl: p.driveUrl,
      fileType: p.contentType,
      caption: p.caption,
      hashtags: p.hashtags,
    }));

    try {
      const res = await fetch('/api/social/share-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: payloadItems,
          platforms: selectedPlatforms,
          mediaType: selectedMediaType,
        }),
      });

      const data: DispatchReport = await res.json();
      setLastDispatchReport(data);

      if (data.success && (data.httpStatus === 200 || data.httpStatus === 201 || data.httpStatus === 202)) {
        // Track newly dispatched file IDs persistently
        const newlyDispatchedCount = previewItems.length;
        const newDispatched = [...(settings.dispatchedFileIds || [])];
        previewItems.forEach((p) => {
          if (!newDispatched.includes(p.fileId)) {
            newDispatched.push(p.fileId);
          }
        });

        // Build log items for History
        const resultsDetails: Array<{ fileName: string; platform: string; status: string; success: boolean }> = [];
        const newLogs: DispatchLogItem[] = [];

        (data.results || []).forEach((r) => {
          resultsDetails.push({
            fileName: r.fileName,
            platform: r.platform,
            status: r.statusText,
            success: r.success,
          });
          newLogs.unshift({
            id: `${r.fileId}-${r.platform}-${Date.now()}`,
            fileName: r.fileName,
            platform: r.platform,
            statusText: r.statusText,
            success: r.success,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            error: r.errorMessage,
          });
        });

        const updatedLogs = [...newLogs, ...dispatchLogs].slice(0, 30);
        setDispatchLogs(updatedLogs);

        setSettings((prev) => ({
          ...prev,
          dispatchedFileIds: newDispatched,
          dispatchLogs: updatedLogs,
          makeStatus: 'CONNECTED',
        }));

        // Persist to server disk so dispatchedFileIds and dispatchLogs survive server restart & reload
        try {
          await fetch('/api/social/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dispatchedFileIds: newDispatched,
              dispatchLogs: updatedLogs,
            }),
          });
        } catch (e) {
          console.warn('Could not sync dispatched settings to server:', e);
        }

        // CRITICAL (Requirement 4): Post ho janey wali tasweer preview se foran ghayab!
        // Immediately remove posted files from preview and candidate list so they appear ONLY in History!
        setPreviewItems([]);

        const successMsg = `⚡ DISPATCHED TO MAKE (HTTP ${data.httpStatus} OK)! ${newlyDispatchedCount} file(s) accepted by Make Webhook. فائل Preview سے ہٹ کر History میں منتقل ہو گئی۔`;
        setShareSuccessBanner({
          msg: successMsg,
          details: resultsDetails,
        });
        showToast(successMsg);
      } else {
        const errReason = data.results?.[0]?.errorMessage || (data as any).error || `Make responded with HTTP ${data.httpStatus || 500}`;
        showToast(`❌ Dispatch Failed: ${errReason}`, true);
      }
    } catch (err: any) {
      const netError = 'Dispatch error: ' + (err?.message || 'Connection failed');
      showToast(netError, true);
    } finally {
      setIsDispatchingNow(false);
    }
  };

  // 9. Test Webhook in Settings (Sends targetPlatform: "test" so nothing is posted to Facebook)
  const handleTestMakeWebhook = async () => {
    setIsTestingWebhook(true);
    setWebhookTestMessage(null);
    try {
      const res = await fetch('/api/social/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: makeUrlInput }),
      });
      const data = await res.json();
      if (data.success) {
        setSettings((prev) => ({
          ...prev,
          makeWebhookUrl: makeUrlInput,
          makeStatus: 'CONNECTED',
        }));
        setWebhookTestMessage('✅ Test Successful! Make.com responded with HTTP 200 OK (Nothing posted to Facebook).');
        showToast('Make Webhook verified successfully (Status 200 OK)!');
      } else {
        setWebhookTestMessage('❌ Test Failed: ' + (data.error || 'No response from webhook'));
      }
    } catch (err: any) {
      setWebhookTestMessage('❌ Connection Error: ' + (err?.message || 'Could not reach server'));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Safe Retry dispatch for items in Posting History (Requirement 10)
  const handleRetryItem = async (logItem: DispatchLogItem) => {
    try {
      showToast(`Retrying dispatch for ${logItem.fileName}...`);
      const res = await fetch('/api/social/share-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              fileName: logItem.fileName,
              fileId: logItem.fileId || logItem.id,
              caption: logItem.caption || `✨ ${logItem.fileName}`,
              hashtags: ['#GNZEEMarket', '#UrduQuotes', '#Pakistan'],
            },
          ],
          platforms: [logItem.platform || 'facebook'],
          mediaType: 'image',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Successfully re-dispatched ${logItem.fileName}!`);
        setDispatchLogs((prev) =>
          prev.map((l) =>
            l.id === logItem.id
              ? { ...l, success: true, statusText: 'PUBLISHED', status: 'PUBLISHED' }
              : l
          )
        );
      } else {
        showToast(`Retry failed: ${data.error || 'Server error'}`, true);
      }
    } catch (err: any) {
      showToast(`Retry error: ${err?.message || ''}`, true);
    }
  };

  // 10. Save Settings (Webhook, Folders & Google Drive Refresh Token)
  const handleSaveSettings = async () => {
    const imgId = extractDriveFolderId(imageFolderInput);
    const vidId = extractDriveFolderId(videoFolderInput);

    const newImageFolder = {
      folderName: 'READY TO POST IMAGES',
      folderId: imgId || READY_TO_POST_IMAGES_FOLDER_ID,
      folderUrl: imageFolderInput.trim(),
    };
    const newVideoFolder = {
      folderName: 'READY TO POST VIDEO',
      folderId: vidId || READY_TO_POST_VIDEO_FOLDER_ID,
      folderUrl: videoFolderInput.trim(),
    };

    try {
      const res = await fetch('/api/social/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          makeWebhookUrl: makeUrlInput.trim(),
          imageFolder: newImageFolder,
          videoFolder: newVideoFolder,
          dailyLimit: dailyLimitInput,
          schedule: {
            time1: scheduleTime1.trim(),
            time2: scheduleTime2.trim(),
            time3: scheduleTime3.trim(),
            dailyLimit: dailyLimitInput,
          },
        }),
      });

      if (refreshTokenInput.trim() || clientIdInput.trim() || clientSecretInput.trim()) {
        await fetch('/api/social/drive-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refreshToken: refreshTokenInput.trim(),
            clientId: clientIdInput.trim(),
            clientSecret: clientSecretInput.trim(),
          }),
        });
      }

      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          makeWebhookUrl: makeUrlInput.trim(),
          imageFolder: newImageFolder,
          videoFolder: newVideoFolder,
          dailyLimit: dailyLimitInput,
          schedule: {
            time1: scheduleTime1.trim(),
            time2: scheduleTime2.trim(),
            time3: scheduleTime3.trim(),
            dailyLimit: dailyLimitInput,
          },
        }));
        showToast('سیٹنگز اور شیڈول کامیابی سے محفوظ ہو گئے! (Settings & Schedule saved)');
        setShowSettingsModal(false);
      }
    } catch (err: any) {
      showToast('سیٹنگز محفوظ کرنے میں خرابی: ' + (err?.message || ''), true);
    }
  };

  // Clear Dispatched history in settings
  const handleClearDispatchedHistory = async () => {
    setSettings((prev) => ({ ...prev, dispatchedFileIds: [], dispatchLogs: [] }));
    setDispatchLogs([]);
    try {
      await fetch('/api/social/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchedFileIds: [], dispatchLogs: [] }),
      });
    } catch (e) {
      // ignore
    }
    showToast('Dispatched history reset. Double-post warnings cleared.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 space-y-6 max-w-5xl mx-auto font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm font-medium border flex items-center gap-2 transition-all animate-in fade-in duration-200 ${
            toastMessage.isError
              ? 'bg-red-950/90 border-red-500 text-red-200'
              : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
          }`}
        >
          {toastMessage.isError ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* =====================================================================
          1. CLEAN TOP HEADER WITH MASTER SWITCH & SETTINGS GEAR
      ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Title & Description */}
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center text-white shadow-lg">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Social Automation Hub
              </h1>
              <p className="text-xs text-slate-400">
                1-Click Multi-Platform Publishing from Google Drive to Facebook &amp; TikTok
              </p>
            </div>
          </div>
        </div>

        {/* Master ON / OFF Switch + Settings Button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Master ON/OFF Toggle */}
          <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 shadow-inner">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Master Switch:
            </span>
            <button
              type="button"
              onClick={handleToggleMasterSwitch}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                settings.autoMode
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40'
                  : 'bg-slate-700'
              }`}
              title={settings.autoMode ? 'Click to turn Automation OFF' : 'Click to turn Automation ON'}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform font-bold text-[10px] flex items-center justify-center text-slate-900 shadow-md ${
                  settings.autoMode ? 'translate-x-9' : 'translate-x-1'
                }`}
              >
                {settings.autoMode ? 'ON' : 'OFF'}
              </span>
            </button>
            <span
              className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                settings.autoMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {settings.autoMode ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>

          {/* Settings Modal Toggle Button */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Open Settings & Webhook Config"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. GNZEE SOCIAL HUB — FLOW OVERVIEW & CONNECTORS (PERMANENT CONNECTIONS)
      ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6">
        {/* Flow Overview Banner */}
        <div className="flex items-center gap-2 sm:gap-4 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto text-xs font-bold text-slate-300">
          <div className="flex-1 min-w-[130px] text-center p-3 rounded-lg bg-slate-900 border border-slate-800 shadow-sm">
            <span className="text-sky-400 font-bold block text-sm">Google Drive</span>
            <span className="text-[10px] text-slate-500 font-mono">Grok tools (1nM8Be...)</span>
          </div>
          <span className="text-slate-500 text-lg font-mono shrink-0">&rarr;</span>
          <div className="flex-1 min-w-[120px] text-center p-3 rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <span className="font-bold block text-sm">Make (Hub)</span>
            <span className="text-[10px] text-indigo-200 font-mono">Auto Webhook Dispatch</span>
          </div>
          <span className="text-slate-500 text-lg font-mono shrink-0">&rarr;</span>
          <div className="flex-1 min-w-[170px] text-center p-3 rounded-lg bg-slate-900 border border-slate-800 shadow-sm">
            <span className="text-emerald-400 font-bold block text-sm">Social Channels</span>
            <span className="text-[10px] text-slate-500 font-mono">Facebook, YouTube, IG, TikTok</span>
          </div>
        </div>

        {/* Connectors List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>Connectors</span>
              <span className="text-[11px] text-slate-400 font-normal font-sans">(ایک بار Connect کرنے کے بعد ہمیشہ برقرار)</span>
            </h2>
            <span className="text-[11px] text-emerald-400 font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Server Persisted
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectors.map((it) => {
              const isDrive = it.id === 'drive';
              const isOn = isDrive ? isDriveConnected : it.status === 'on';
              const isWait = it.status === 'wait';

              const txt = isOn
                ? 'Connected'
                : isWait
                ? 'Sign in on the new tab, then confirm'
                : 'Not connected';

              const btnLabel = isOn
                ? 'Disconnect'
                : isWait
                ? "I've signed in"
                : isDrive && isAuthorizingDrive
                ? 'Connecting...'
                : 'Connect';

              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3.5 border rounded-xl p-3.5 transition-all ${
                    isOn
                      ? 'bg-slate-950 border-emerald-500/40 shadow-sm'
                      : isWait
                      ? 'bg-indigo-950/30 border-indigo-500/50'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 text-base shadow-md"
                    style={{ backgroundColor: it.c }}
                  >
                    {it.l}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs sm:text-sm text-white truncate flex items-center gap-2">
                      <span>{it.n}</span>
                      {isOn && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-normal">
                          CONNECTED
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs font-medium truncate ${
                        isOn
                          ? 'text-emerald-400 font-semibold'
                          : isWait
                          ? 'text-indigo-300 font-semibold animate-pulse'
                          : 'text-slate-500'
                      }`}
                    >
                      {txt}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConnectorAction(it)}
                    disabled={isDrive && isAuthorizingDrive}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      isOn
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : isWait
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                    }`}
                  >
                    {btnLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Make Webhook URL Section */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="hub-hook" className="text-xs font-bold text-slate-200">
              Make webhook URL
            </label>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                settings.makeStatus === 'CONNECTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              Status: {settings.makeStatus === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="hub-hook"
              type="url"
              value={makeUrlInput}
              onChange={(e) => setMakeUrlInput(e.target.value)}
              placeholder="https://hook.make.com/..."
              autoComplete="off"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-400"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveMakeUrlFromHub}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-md"
              >
                Save URL
              </button>
              {makeSaveMsg && (
                <span className="text-xs text-emerald-400 font-bold font-mono">
                  {makeSaveMsg}
                </span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Create a scenario in{' '}
            <a
              href="https://www.make.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline font-medium"
            >
              Make
            </a>
            , add a Custom webhook, and paste its URL here. On the server, this is stored permanently and set as MAKE_WEBHOOK_URL.
          </p>
        </div>
      </div>

      {/* =====================================================================
          3. MAIN CONTROL CARD: PLATFORMS, CONTENT TYPE & PREVIEW FLOW
      ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6">
        {/* SECTION A: TARGET PLATFORMS (ONLY FACEBOOK & TIKTOK ACTIVE) */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
            <span>1. Select Target Social Platforms:</span>
            <span className="text-[11px] text-slate-400 lowercase font-mono">
              (Instagram &amp; YouTube reserved for future updates)
            </span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Facebook Page */}
            <button
              type="button"
              onClick={() => togglePlatform('facebook')}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                selectedPlatforms.includes('facebook')
                  ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-600/20 ring-1 ring-blue-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
                  f
                </span>
                <div>
                  <p className="font-bold text-xs text-white">Facebook Page</p>
                  <p className="text-[10px] text-blue-300">GNZEE Market</p>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  selectedPlatforms.includes('facebook') ? 'bg-blue-500 text-white' : 'border border-slate-700'
                }`}
              >
                {selectedPlatforms.includes('facebook') && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>

            {/* TikTok Reminder */}
            <button
              type="button"
              onClick={() => togglePlatform('tiktok')}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                selectedPlatforms.includes('tiktok')
                  ? 'bg-pink-600/20 border-pink-500 text-white shadow-lg shadow-pink-600/20 ring-1 ring-pink-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-black text-pink-500 font-bold flex items-center justify-center text-sm border border-slate-700 shrink-0">
                  ♪
                </span>
                <div>
                  <p className="font-bold text-xs text-white">TikTok</p>
                  <p className="text-[10px] text-pink-300">Reminder Only</p>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  selectedPlatforms.includes('tiktok') ? 'bg-pink-500 text-white' : 'border border-slate-700'
                }`}
              >
                {selectedPlatforms.includes('tiktok') && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>

            {/* Instagram Professional */}
            <button
              type="button"
              onClick={() => togglePlatform('instagram')}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                selectedPlatforms.includes('instagram')
                  ? 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-pink-500 text-white shadow-lg shadow-pink-600/20 ring-1 ring-pink-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  📷
                </span>
                <div>
                  <p className="font-bold text-xs text-white">Instagram</p>
                  <p className="text-[10px] text-pink-300">Professional (Meta)</p>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  selectedPlatforms.includes('instagram') ? 'bg-pink-500 text-white' : 'border border-slate-700'
                }`}
              >
                {selectedPlatforms.includes('instagram') && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>

            {/* YouTube Shorts / Videos */}
            <button
              type="button"
              onClick={() => togglePlatform('youtube')}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                selectedPlatforms.includes('youtube')
                  ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/20 ring-1 ring-red-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-red-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  ▶
                </span>
                <div>
                  <p className="font-bold text-xs text-white">YouTube</p>
                  <p className="text-[10px] text-red-300">Shorts / Videos</p>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  selectedPlatforms.includes('youtube') ? 'bg-red-600 text-white' : 'border border-slate-700'
                }`}
              >
                {selectedPlatforms.includes('youtube') && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          </div>
        </div>

        {/* SECTION B: CONTENT TYPE & QUANTITY CONTROLS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
          {/* Media Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              Content Type (Drive Folder):
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMediaType('image')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  selectedMediaType === 'image'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Image</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMediaType('video')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  selectedMediaType === 'video'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Video className="w-3.5 h-3.5 shrink-0" />
                <span>Video</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMediaType('both')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  selectedMediaType === 'both'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>Both</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono truncate">
              Folder: Ready to Post (10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw)
            </p>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              Quantity to Fetch:
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedCount(1);
                  setIsCustomCount(false);
                }}
                className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${
                  !isCustomCount && selectedCount === 1
                    ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>1 Latest</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCount(2);
                  setIsCustomCount(false);
                }}
                className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${
                  !isCustomCount && selectedCount === 2
                    ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>2 Latest</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCount(3);
                  setIsCustomCount(false);
                }}
                className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${
                  !isCustomCount && selectedCount === 3
                    ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>3 Latest</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustomCount(true);
                  setSelectedCount(customCountInput || 4);
                }}
                className={`py-2 px-1 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${
                  isCustomCount
                    ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>Custom</span>
              </button>
            </div>
            {isCustomCount ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400">Custom Count:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={customCountInput}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                    setCustomCountInput(val);
                    setSelectedCount(val);
                  }}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-sky-400"
                />
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 font-mono">
                Sorted by createdTime (newest first)
              </p>
            )}
          </div>

          {/* Show Preview Trigger */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <button
              type="button"
              onClick={() => loadRealDrivePreview()}
              disabled={isLoadingPreview || !isDriveConnected}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all ${
                isDriveConnected
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isLoadingPreview ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Google Drive...</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Show Preview</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Reads real files &amp; prepares editable posts
            </p>
          </div>
        </div>

        {/* SECTION C: REAL DRIVE POST PREVIEWS (NO FAKE / DEMO DATA) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Prepared Post Preview:</span>
            </label>
            {previewItems.length > 0 && (
              <span className="text-[11px] text-slate-400 font-mono">
                {previewItems.length} real file(s) loaded
              </span>
            )}
          </div>

          {/* Empty / Unconnected State */}
          {!isDriveConnected ? (
            <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/20">
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Google Drive Not Connected</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No mock or sample data is used. Click below to authorize Google Drive (Ready to Post folder: <span className="font-mono text-sky-400">10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw</span>) to read your marketing images and videos.
              </p>
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  disabled={isAuthorizingDrive}
                  className="py-2.5 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-sky-500/20"
                >
                  <HardDrive className="w-4 h-4" />
                  <span>{isAuthorizingDrive ? 'Connecting to Google...' : driveUser ? 'Reconnect Google Drive' : 'Connect Google Drive'}</span>
                </button>
              </div>
            </div>
          ) : previewItems.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {hasCheckedTodayFiles ? 'No new files today' : 'Ready to Check Today\'s Files'}
                </span>
                <h3 className="text-sm font-bold text-white pt-1">
                  {hasCheckedTodayFiles
                    ? 'No new files today (آج کی کوئی نئی فائل نہیں ملی)'
                    : 'Show Preview دبا کر آج کی تازہ ترین فائلیں لوڈ کریں'}
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                {hasCheckedTodayFiles ? (
                  <>
                    سسٹم نے صرف <strong className="text-slate-200">آج کی تاریخ (Asia/Karachi)</strong> کی ایسی فائلیں فلٹر کیں جن کی fileId پہلے کبھی Make کو نہ بھیجی گئی ہو۔
                    <br />
                    پرانی فائلوں پر سسٹم واپس نہیں جاتا۔ جیسے ہی آپ Drive میں آج کا نیا امیج ڈالیں گے، وہ خود سامنے آئے گا اور Gemini اس کا کیپشن تیار کرے گا۔
                  </>
                ) : (
                  <>
                    Select your content type ({selectedMediaType}, 1 or 2 files) and click{' '}
                    <span className="font-bold text-indigo-400">&quot;Show Preview&quot;</span> to load today&apos;s newest unposted files.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => loadRealDrivePreview()}
                disabled={isLoadingPreview}
                className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                <span>چیک کریں (Check Today&apos;s New Files)</span>
              </button>
            </div>
          ) : (
            /* Cards List (1 or 2 files) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previewItems.map((card, idx) => (
                <div
                  key={card.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-xl flex flex-col justify-between"
                >
                  {/* Top Badge & Filename */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300">
                        File #{idx + 1} ({card.contentType})
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          card.status === 'SENT TO MAKE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {card.status}
                      </span>
                    </div>

                    {/* Double-Post Warning Badge */}
                    {card.isPreviouslyDispatched && (
                      <div className="p-2 rounded-lg bg-amber-950/70 border border-amber-500/50 text-amber-300 text-[11px] flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>⚠️ Previously Dispatched (Double-post warning)</span>
                      </div>
                    )}

                    {/* Gemini Vision Transcribed Image Text */}
                    {card.transcribedText && (
                      <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-500/30 text-sky-200 text-[11px] space-y-0.5 mb-2">
                        <span className="font-bold text-sky-400 block text-[10px]">
                          🔍 Gemini Vision (تصویر پر لکھا اصل متن):
                        </span>
                        <p className="font-sans line-clamp-2 italic">&ldquo;{card.transcribedText}&rdquo;</p>
                      </div>
                    )}

                    {/* Needs Approval Alert */}
                    {card.status === 'NEEDS APPROVAL' && (
                      <div className="p-2 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-[11px] flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                        <span>NEEDS APPROVAL: {card.approvalNote || 'اردو متن کی جانچ درکار ہے۔'}</span>
                      </div>
                    )}

                    {/* Real Media Preview (Thumbnail or Video Link) */}
                    <div className="relative rounded-xl bg-slate-900 border border-slate-800 overflow-hidden aspect-video flex items-center justify-center group mb-3">
                      {card.thumbnailLink ? (
                        <img
                          src={card.thumbnailLink}
                          alt={card.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-1">
                          {card.contentType === 'video' ? (
                            <Video className="w-8 h-8 text-amber-400 mx-auto" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-sky-400 mx-auto" />
                          )}
                          <p className="text-[11px] text-slate-400 font-mono">No direct thumbnail available</p>
                        </div>
                      )}
                      <a
                        href={card.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 hover:bg-black text-[10px] text-slate-200 flex items-center gap-1 backdrop-blur-xs font-mono"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open in Drive</span>
                      </a>
                    </div>

                    {/* File Meta */}
                    <div className="space-y-0.5 text-xs font-mono">
                      <p className="font-bold text-slate-200 truncate">{card.fileName}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Uploaded: {card.createdTime ? new Date(card.createdTime).toLocaleString() : 'Recent'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Editable Headline */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      Headline / Hook (Editable):
                    </label>
                    <input
                      type="text"
                      value={card.headline}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPreviewItems((prev) =>
                          prev.map((c) => (c.id === card.id ? { ...c, headline: val } : c))
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                    />
                  </div>

                  {/* Editable Caption (Urdu/English Bilingual) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-300 block">
                        Caption (Urdu &amp; English, Editable):
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRegenerateCardCaption(card.id)}
                        disabled={card.isGeneratingAi}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{card.isGeneratingAi ? 'Generating...' : 'Regenerate AI'}</span>
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={card.caption}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPreviewItems((prev) =>
                          prev.map((c) =>
                            c.id === card.id
                              ? {
                                  ...c,
                                  caption: val,
                                  status: !val.trim() ? 'NEEDS APPROVAL' : 'READY TO POST',
                                }
                              : c
                          )
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed resize-y font-sans"
                    />
                  </div>

                  {/* Editable Hashtags */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      Hashtags (Comma-separated, Editable):
                    </label>
                    <input
                      type="text"
                      value={card.hashtags.join(', ')}
                      onChange={(e) => {
                        const tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        setPreviewItems((prev) =>
                          prev.map((c) => (c.id === card.id ? { ...c, hashtags: tags } : c))
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Card Actions: Copy Caption, Copy Hashtags, Regenerate, Save Changes (Section 5) */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(card.caption);
                            setCopiedCaptionId(card.id);
                            showToast('Caption copied to clipboard!');
                            setTimeout(() => setCopiedCaptionId(null), 2500);
                          }
                        }}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Copy className="w-3 h-3 text-sky-400" />
                        <span>{copiedCaptionId === card.id ? 'Copied!' : 'Copy Caption'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(card.hashtags.join(' '));
                            setCopiedTagsId(card.id);
                            showToast('Hashtags copied to clipboard!');
                            setTimeout(() => setCopiedTagsId(null), 2500);
                          }
                        }}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Copy className="w-3 h-3 text-amber-400" />
                        <span>{copiedTagsId === card.id ? 'Copied!' : 'Copy Hashtags'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRegenerateCardCaption(card.id)}
                        disabled={card.isGeneratingAi}
                        className="px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] flex items-center gap-1 cursor-pointer transition-colors border border-amber-500/30"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>{card.isGeneratingAi ? 'Regenerating...' : 'Regenerate'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSavedCardId(card.id);
                          showToast('Changes saved to preview card!');
                          setTimeout(() => setSavedCardId(null), 2500);
                        }}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>{savedCardId === card.id ? 'Saved ✓' : 'Save Changes'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION D: SUCCESS BANNER */}
        {shareSuccessBanner && (
          <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{shareSuccessBanner.msg}</span>
              </div>
              <button
                type="button"
                onClick={() => setShareSuccessBanner(null)}
                className="text-emerald-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
              {shareSuccessBanner.details.map((d, i) => (
                <div
                  key={i}
                  className="bg-emerald-900/40 p-2 rounded border border-emerald-500/20 flex items-center justify-between"
                >
                  <span className="truncate">{d.fileName}</span>
                  <span className="capitalize font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                    {d.platform}: {d.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION E: MAIN ACTION BUTTON "SHARE NOW" */}
        <div className="pt-2">
          {selectedMediaType === 'video' ? (
            <button
              type="button"
              disabled
              className="w-full py-4 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 bg-slate-800 text-slate-500 cursor-not-allowed opacity-75 border border-slate-700/50"
            >
              <Clock className="w-5 h-5 text-amber-500" />
              <span>Video Sharing Coming Soon (Make scenario is currently image-only)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShareNowClick}
              disabled={isDispatchingNow || previewItems.length === 0}
              className={`w-full py-4 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-2xl transition-all cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                previewItems.length > 0 && settings.autoMode
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isDispatchingNow ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Dispatching to Make Webhook...</span>
                </>
              ) : !settings.autoMode ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span>Turn Master Switch ON Above to Share Now</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 fill-white" />
                  <span>
                    ⚡ Share Now — Publish to [{selectedPlatforms.join(' • ')}]
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* SECTION F: MAKE.COM LIVE DISPATCH INSPECTOR (FULL JSON & HTTP FEEDBACK) */}
        {lastDispatchReport && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {lastDispatchReport.httpStatus === 200 || lastDispatchReport.httpStatus === 201 || lastDispatchReport.httpStatus === 202 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <span>Make.com Dispatch Live Result:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                        lastDispatchReport.httpStatus === 200 || lastDispatchReport.httpStatus === 201
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      HTTP {lastDispatchReport.httpStatus} {lastDispatchReport.httpStatus === 200 ? 'OK (Accepted)' : 'Failed'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                    Destination Webhook: {settings.makeWebhookUrl}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLastDispatchReport(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Result cards for each sent payload */}
            <div className="space-y-3">
              {lastDispatchReport.results.map((res, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-200 truncate">
                      {res.fileName} &rarr; <span className="text-emerald-400 uppercase font-bold">{res.platform}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        res.success
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      {res.statusText}
                    </span>
                  </div>

                  {res.errorMessage && (
                    <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-500/40 text-red-200 text-xs font-mono">
                      ⚠️ Error Cause: {res.errorMessage}
                    </div>
                  )}

                  {/* Full Sent JSON */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Full Dispatched JSON to Make Webhook:</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(JSON.stringify(res.payloadSent, null, 2));
                            showToast('Copied payload JSON to clipboard!');
                          }
                        }}
                        className="text-amber-400 hover:text-amber-300 cursor-pointer text-[10px]"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-black/90 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed max-h-56">
                      {JSON.stringify(res.payloadSent, null, 2)}
                    </pre>
                  </div>

                  {res.responseBody && (
                    <p className="text-[11px] text-slate-400 font-mono">
                      Make Response: <span className="text-slate-200">&quot;{res.responseBody}&quot;</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          4. POSTING HISTORY & JOB STATUS (REQUIREMENT 10)
      ===================================================================== */}
      <div id="posting-history-section" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Posting History &amp; Job Status
              </h3>
              <p className="text-[11px] text-slate-400">
                Persistent log of all manual and scheduled publishing jobs
              </p>
            </div>
          </div>
          {dispatchLogs.length > 0 && (
            <button
              type="button"
              onClick={() => setDispatchLogs([])}
              className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {dispatchLogs.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-950 border border-slate-800/80 text-center text-xs text-slate-400 space-y-1">
            <p className="font-bold text-slate-300">No posting jobs recorded yet.</p>
            <p>Load preview files above and click &quot;⚡ Share Now&quot; to publish your first post.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                  <th className="py-2.5 px-3 font-semibold">Job ID</th>
                  <th className="py-2.5 px-3 font-semibold">File Name</th>
                  <th className="py-2.5 px-3 font-semibold">Platform</th>
                  <th className="py-2.5 px-3 font-semibold">Time</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dispatchLogs.map((log) => {
                  const currentStatus = log.status || (log.success ? 'PUBLISHED' : 'FAILED');
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px] truncate max-w-[90px]">
                        {log.id.slice(0, 10)}
                      </td>
                      <td className="py-2.5 px-3 text-white font-medium truncate max-w-[180px]">
                        {log.fileName}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-slate-300 font-bold text-[10px]">
                        {log.platform}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            currentStatus === 'PUBLISHED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : currentStatus === 'FAILED'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : currentStatus === 'SCHEDULED'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : currentStatus === 'NEEDS_APPROVAL'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {currentStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {!log.success && (
                          <button
                            type="button"
                            onClick={() => handleRetryItem(log)}
                            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================================
          5. CONFIRMATION MODAL ("تصدیقی ونڈو")
      ===================================================================== */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Confirm Dispatch / بھیجنے کی تصدیق
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300">
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                <p className="text-emerald-300 font-bold text-sm text-right leading-relaxed" dir="rtl">
                  یہ فائلیں یہ پلیٹ فارمز پر جائیں گی:
                </p>
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1 font-mono text-xs text-slate-200">
                  {previewItems.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1 last:border-0 last:pb-0">
                      <span className="truncate font-semibold text-white">[{c.fileName}]</span>
                      <span className="text-emerald-400 font-bold shrink-0">
                        &rarr; [{selectedPlatforms.map((p) => (p === 'facebook' ? 'Facebook' : 'TikTok')).join(' / ')}]
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-slate-300 font-medium text-xs text-right pt-1" dir="rtl">
                  کیا آپ واقعی بھیجنا چاہتے ہیں؟ ہاں / نہیں
                </p>
              </div>

              {previewItems.some((c) => c.isPreviouslyDispatched) && (
                <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Warning: One or more selected files were previously dispatched. Are you sure you want to re-send?
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-400 font-mono">
                Payload will be sent separately for each file to Make Webhook:
                <br />
                <span className="text-slate-500 truncate block">{settings.makeWebhookUrl}</span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                No / نہیں (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteShareNow}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-emerald-500/30 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Yes / ہاں (Share Now)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. TABBED SETTINGS MODAL (CLICKABLE CHIPS & GEAR ICON)
      ===================================================================== */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col text-left">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Integration &amp; Automation Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={() => setSettingsTab('folders')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'folders'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                📁 Drive Folders
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('schedule')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'schedule'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                ⏰ شیڈول (Schedule)
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('drive')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'drive'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                ☁️ Google Drive &amp; Token
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('make')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'make'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                ⚡ Make Webhook
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('facebook')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'facebook'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                📘 Facebook
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('tiktok')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'tiktok'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                ♪ TikTok
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('storage')}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-all ${
                  settingsTab === 'storage'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                💾 Deploy &amp; Storage
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
              {/* TAB 1: FOLDERS CONFIGURATION (REQUIREMENT 3) */}
              {settingsTab === 'folders' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <p className="font-bold text-white text-xs">
                      📁 فولڈر کی سیٹنگ (Folder Link to Auto-ID)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      کسی بھی Google Drive فولڈر کا پورا لنک (URL) یہاں پیسٹ کریں یا سیدھی ID درج کریں۔ سسٹم خودکار طور پر ID نکال کر محفوظ کر لے گا۔
                    </p>
                  </div>

                  {/* Image Folder */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-200">
                        1. READY TO POST IMAGES Folder Link / ID:
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        Image Folder
                      </span>
                    </div>
                    <input
                      type="text"
                      value={imageFolderInput}
                      onChange={(e) => setImageFolderInput(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                      <span>Extracted Folder ID:</span>
                      <span className="text-amber-400 font-bold truncate max-w-[280px]">
                        {extractDriveFolderId(imageFolderInput) || 'None detected'}
                      </span>
                    </div>
                  </div>

                  {/* Video Folder */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-200">
                        2. READY TO POST VIDEO Folder Link / ID:
                      </label>
                      <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                        Video Folder (Coming soon)
                      </span>
                    </div>
                    <input
                      type="text"
                      value={videoFolderInput}
                      onChange={(e) => setVideoFolderInput(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                      <span>Extracted Folder ID:</span>
                      <span className="text-amber-400 font-bold truncate max-w-[280px]">
                        {extractDriveFolderId(videoFolderInput) || 'None detected'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: SCHEDULE (REQUIREMENT 4) */}
              {settingsTab === 'schedule' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>روزانہ خودکار اشاعت کا شیڈول (Daily Auto-Post Schedule)</span>
                      </p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        Asia/Karachi (PKT)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                      جب اوپر <strong className="text-emerald-400">Master Switch ON</strong> ہوگا تو سرور ان دو اوقات پر خودکار طور پر Google Drive سے آج کی نئی فائلیں Make Webhook پر بھیجے گا۔ اگر Master Switch <strong className="text-slate-300">OFF</strong> ہو تو خودکار طور پر کچھ نہیں جائے گا۔
                    </p>
                  </div>

                  {/* Three Time Pickers */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <label className="font-bold text-slate-200 block text-xs flex items-center justify-between">
                        <span>1. صبح (Morning):</span>
                        <span className="text-[10px] text-amber-400 font-mono">08:00 AM</span>
                      </label>
                      <input
                        type="text"
                        value={scheduleTime1}
                        onChange={(e) => setScheduleTime1(e.target.value)}
                        placeholder="08:00 AM"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 block">وقت 1: 08:00 AM (PKT)</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <label className="font-bold text-slate-200 block text-xs flex items-center justify-between">
                        <span>2. دوپہر (Afternoon):</span>
                        <span className="text-[10px] text-amber-400 font-mono">02:00 PM</span>
                      </label>
                      <input
                        type="text"
                        value={scheduleTime2}
                        onChange={(e) => setScheduleTime2(e.target.value)}
                        placeholder="02:00 PM"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 block">وقت 2: 02:00 PM (PKT)</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <label className="font-bold text-slate-200 block text-xs flex items-center justify-between">
                        <span>3. شام (Evening):</span>
                        <span className="text-[10px] text-amber-400 font-mono">06:00 PM</span>
                      </label>
                      <input
                        type="text"
                        value={scheduleTime3}
                        onChange={(e) => setScheduleTime3(e.target.value)}
                        placeholder="06:00 PM"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 block">وقت 3: 06:00 PM (PKT)</span>
                    </div>
                  </div>

                  {/* Daily Limit */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <label className="font-bold text-slate-200 block text-xs">
                      روزانہ زیادہ سے زیادہ فائلیں (Daily Limit):
                    </label>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setDailyLimitInput(1)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          dailyLimitInput === 1
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        1 فائل روزانہ
                      </button>
                      <button
                        type="button"
                        onClick={() => setDailyLimitInput(2)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          dailyLimitInput === 2
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        2 فائلیں روزانہ
                      </button>
                      <button
                        type="button"
                        onClick={() => setDailyLimitInput(3)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          dailyLimitInput === 3
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        3 فائلیں روزانہ (تجویز کردہ - 3 ٹائم سلاٹ)
                      </button>
                    </div>
                  </div>

                  {/* Render Sleep / Wakeup Trigger Webhook URL */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Render Wake-up Trigger URL (سلیپ بوٹ کو وقت پر جگانے کا حل):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const triggerUrl = `${window.location.origin}/api/social/cron-trigger`;
                          navigator.clipboard?.writeText(triggerUrl);
                          showToast('Trigger URL کاپی ہو گیا!');
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>URL کاپی کریں</span>
                      </button>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 font-mono text-[11px] text-amber-300 select-all break-all border border-slate-800">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/social/cron-trigger` : '/api/social/cron-trigger'}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      💡 <strong>Render فری پلین کا فائدہ:</strong> آپ کو سرور 24 گھنٹے چالو رکھنے کی ضرورت نہیں۔ مفت ویب سائٹ <strong className="text-amber-300">cron-job.org</strong> پر مفت اکاؤنٹ بنا کر اس URL کو صبح 8:00 AM، دوپہر 2:00 PM اور شام 6:00 PM پر پنگ کرنے کے لیے لگا دیں۔ سرور صرف 2 منٹ جاگ کر آج کی تصویر پوسٹ کرے گا اور خودبخود سو جائے گا! اس سے مفت گھنٹے کبھی ختم نہیں ہوں گے۔
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        showToast('شیڈول ٹریگر کی جانچ ہو رہی ہے...');
                        try {
                          const res = await fetch('/api/social/cron-trigger?force=true');
                          const data = await res.json();
                          if (data.success) {
                            showToast(data.message || 'شیڈول ٹیسٹ کامیاب رہا!');
                          } else {
                            showToast('نتیجہ: ' + (data.message || data.error), true);
                          }
                        } catch (err: any) {
                          showToast('ٹریگر ٹیسٹ ایرر: ' + err.message, true);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-white font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>ابھی ٹریگر ٹیسٹ کریں (Test Cron Trigger Now)</span>
                    </button>
                  </div>

                  {/* Live Status indicator */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>حالیہ پاکستان ٹائم:</span>
                      <span className="font-mono text-amber-400 font-bold">{livePakistanTime} PKT</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>ماسٹر سوئچ کی حالت:</span>
                      <span className={`font-mono font-bold ${settings.autoMode ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {settings.autoMode ? 'ACTIVE (خودکار ترسیل آن ہے)' : 'OFF (خودکار ترسیل بند ہے)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>دستی اشاعت (Share Now):</span>
                      <span className="text-sky-400 font-bold">ہمیشہ فعال (بغیر شیڈول کے فوری بھیجیں)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: GOOGLE DRIVE & REFRESH TOKEN (REQUIREMENT 1) */}
              {settingsTab === 'drive' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Status Banner */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-xs">
                        Google Drive Status:
                        <span className={`ml-2 font-mono ${isDriveConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {isDriveConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        User: {driveUser?.email || settings.googleDriveAuth?.userEmail || 'eisakhanmari7@gmail.com'}
                      </p>
                    </div>
                    {isDriveConnected ? (
                      <button
                        type="button"
                        onClick={handleDisconnectDrive}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-bold cursor-pointer"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConnectGoogleDrive}
                        disabled={isAuthorizingDrive}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer flex items-center gap-1.5"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>{isAuthorizingDrive ? 'Connecting...' : 'Connect OAuth'}</span>
                      </button>
                    )}
                  </div>

                  {/* Why Drive Disconnects & How to Fix */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <p className="font-bold text-amber-300 text-xs">
                      ⚠️ Drive بار بار کیوں ڈس کنیکٹ ہوتا ہے اور مستقل حل:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
                      <li>
                        <strong>Access Token کی میعاد:</strong> گوگل کا معیاری Access Token صرف <strong>1 گھنٹے (60 منٹ)</strong> کے لیے کارآمد ہوتا ہے۔
                      </li>
                      <li>
                        <strong>Google Cloud &quot;Testing&quot; موڈ:</strong> اگر Google Cloud Console میں OAuth Consent Screen &quot;Testing&quot; حالت میں ہو تو گوگل ہر ٹوکن کو <strong>7 دن</strong> بعد جبراً ایکسپائر کر دیتا ہے۔
                      </li>
                      <li>
                        <strong>حل (Google Cloud میں قدم):</strong> Google Cloud Console میں جا کر اپنے پروجیکٹ کے <code>OAuth consent screen</code> پر کلک کریں اور <strong>&quot;Publish App&quot;</strong> دبا کر Publishing status کو <strong>&quot;In production&quot;</strong> پر سوئچ کر دیں۔
                      </li>
                    </ul>
                  </div>

                  {/* Permanent Server Refresh Token Inputs */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-white text-xs">
                        مستقل Refresh Token (Server-Side Auto Renewal):
                      </label>
                      <button
                        type="button"
                        onClick={handleRefreshDriveToken}
                        disabled={isRefreshingDriveToken || !refreshTokenInput.trim()}
                        className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRefreshingDriveToken ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingDriveToken ? 'Renewing...' : 'Renew Token Now'}</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] text-slate-400 block">Google OAuth Refresh Token:</span>
                      <input
                        type="password"
                        value={refreshTokenInput}
                        onChange={(e) => setRefreshTokenInput(e.target.value)}
                        placeholder="1//04... (Permanent Refresh Token)"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 block">OAuth Client ID (Optional):</span>
                        <input
                          type="text"
                          value={clientIdInput}
                          onChange={(e) => setClientIdInput(e.target.value)}
                          placeholder="...apps.googleusercontent.com"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Client Secret (Optional):</span>
                        <input
                          type="password"
                          value={clientSecretInput}
                          onChange={(e) => setClientSecretInput(e.target.value)}
                          placeholder="GOCSPX-..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: MAKE WEBHOOK */}
              {settingsTab === 'make' && (
                <div className="space-y-3.5 animate-in fade-in">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 block">
                      Make.com Webhook URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={makeUrlInput}
                        onChange={(e) => setMakeUrlInput(e.target.value)}
                        placeholder="https://hook.us2.make.com/..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestMakeWebhook}
                        disabled={isTestingWebhook}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                      >
                        {isTestingWebhook ? 'Testing...' : 'Test Webhook'}
                      </button>
                    </div>
                  </div>

                  {webhookTestMessage && (
                    <div className="text-xs font-mono text-slate-200 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
                      {webhookTestMessage}
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1 text-[11px] text-slate-400">
                    <p className="font-bold text-slate-300">ℹ️ محفوظ ٹیسٹ کی تفصیل:</p>
                    <p>
                      &quot;Test Webhook&quot; بٹن دبانے سے Make.com کو ایک ٹیسٹ پے لوڈ (<code>targetPlatform: &quot;test&quot;</code>) جاتا ہے۔ Make اسے قبول کر کے 200 OK جواب دیتا ہے لیکن فیس بک پر کچھ پوسٹ نہیں ہوتا۔
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 4: FACEBOOK CHANNEL */}
              {settingsTab === 'facebook' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">f</span>
                      <h4 className="font-bold text-white text-xs">Facebook Page Integration (GNZEE Market)</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      فیس بک پر خودکار پوسٹنگ Make.com سینریو کے ذریعے ہوتی ہے۔ Make کا فیس بک پیجز ماڈیول آپ کی گوگل ڈرائیو کی تصویر ڈاؤن لوڈ کر کے اصل عنوان، کیپشن، اور ہیش ٹیگز کے ساتھ شائع کرتا ہے۔
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                    <p className="font-bold text-emerald-400">✅ اسٹیٹس: فعال (Active via Make)</p>
                    <p className="text-slate-400">ضروری اجازتیں: <code>pages_manage_posts</code> اور <code>pages_read_engagement</code></p>
                  </div>
                </div>
              )}

              {/* TAB 5: TIKTOK CHANNEL */}
              {settingsTab === 'tiktok' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-black text-pink-500 border border-slate-700 flex items-center justify-center font-bold text-xs">♪</span>
                      <h4 className="font-bold text-white text-xs">TikTok Publishing Channel</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      ٹک ٹاک خودکار شیڈولنگ کے لیے باقاعدہ TikTok Developer Partner Approval مانگتا ہے، اسی لیے ہب میں اسے محفوظ <strong>&quot;REMINDER ONLY&quot;</strong> رکھا گیا ہے۔
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                    <p className="font-bold text-pink-400">ℹ️ اسٹیٹس: ریمائنڈر موڈ (Reminder Only)</p>
                    <p className="text-slate-400">کوئی غیر مجاز چارج یا API بلاکنگ نہیں ہوگی۔</p>
                  </div>
                </div>
              )}

              {/* TAB 6: DEPLOYMENT & PERMANENT STORAGE (REQUIREMENT 6) */}
              {settingsTab === 'storage' && (
                <div className="space-y-3.5 animate-in fade-in">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>Render / Railway پر مستقل اسٹوریج (Persistent Volume)</span>
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      سرور پر ڈیٹا (سیٹنگز، فولڈر IDs، اور بھیجی گئی فائلیں <code>social_queue_store.json</code>) میں محفوظ رہتا ہے۔
                    </p>
                    <div className="p-2.5 rounded-lg bg-black font-mono text-[11px] text-emerald-300 border border-slate-800 space-y-1">
                      <p># Render یا Railway پر مستقل ڈسک کے لیے اینوائرنمنٹ ویری ایبل:</p>
                      <p className="text-amber-300">DATA_DIR=/data</p>
                      <p># اور Render/Railway ڈیش بورڈ میں ایک Disk/Volume کو /data پر ماؤنٹ کر دیں</p>
                    </div>
                  </div>

                  {/* Dispatched History Reset */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-200">
                        Dispatched Files History ({settings.dispatchedFileIds?.length || 0}):
                      </label>
                      {(settings.dispatchedFileIds?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={handleClearDispatchedHistory}
                          className="px-2.5 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 text-[11px] font-bold cursor-pointer"
                        >
                          Reset History
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      یہ تمام fileIds مستقل طور پر محفوظ ہیں تاکہ کوئی فائل دوبارہ غلطی سے ڈبل پوسٹ نہ ہو۔ اگر آپ تمام پرانی فائلوں کو دوبارہ نئی فائل بنانا چاہتے ہیں تو Reset History دبائیں۔
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-amber-500/20"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Strict minimal read-only scope for fetching and viewing images/videos
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
// Force consent prompt so Google always prompts for Drive permissions and provides fresh token
provider.setCustomParameters({
  prompt: 'consent select_account',
  access_type: 'offline',
});

// In-memory cache for the access token (Never stored in localStorage)
let cachedAccessToken: string | null = null;
let cachedUser: any | null = null;
let isSigningIn = false;

// Clean up any legacy tokens stored in localStorage to prevent leaks
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('gnzee_drive_access_token_v2');
    localStorage.removeItem('gnzee_drive_user_v2');
  }
} catch {
  // Ignore
}

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  type: 'image' | 'video';
  status: 'READY';
}

export const MARKETING_FOLDER_ID = '1wuQIyIihJCt247aYDALrmDQItMI0z-Og';
export const MARKETING_FOLDER_NAME = 'For Marketing';

export const READY_TO_POST_IMAGES_FOLDER_ID = '1_Z5-fWGOK8eOW2nPyCrFtQ-8iaaQc_QQ';
export const READY_TO_POST_IMAGES_FOLDER_NAME = 'Image ready to post';
export const READY_TO_POST_FOLDER_URL = 'https://drive.google.com/drive/folders/1nM8BeH7Nnb9MMRIoA23qEmTrLbi19Gsg';

export const READY_TO_POST_VIDEO_FOLDER_ID = '1EzfXVDQ91hvq3M4hlk9UhnT5IBJZY4mM';
export const READY_TO_POST_VIDEO_FOLDER_NAME = 'Vedio ready to post';

export const READY_TO_POST_FOLDER_ID = '1nM8BeH7Nnb9MMRIoA23qEmTrLbi19Gsg';
export const READY_TO_POST_FOLDER_NAME = 'Grok tools';

// Helper: Save token securely to Server
export async function persistDriveToken(token: string | null, userObj?: any): Promise<{
  connected: boolean;
  folderAccessible?: boolean;
  fileCount?: number;
  verifyError?: string | null;
}> {
  cachedAccessToken = token;
  if (userObj) cachedUser = userObj;

  try {
    const res = await fetch('/api/social/drive-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: !!token,
        accessToken: token || '',
        userEmail: userObj?.email || 'eisakhanmari7@gmail.com',
        userName: userObj?.displayName || 'GNZEE User',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        connected: Boolean(data?.connected),
        folderAccessible: Boolean(data?.folderAccessible),
        fileCount: data?.fileCount,
        verifyError: data?.verifyError,
      };
    }
  } catch (err) {
    console.warn('Server sync notice:', err);
  }

  return { connected: !!token };
}

// Helper: Check if token can access the Ready to Post folder
export const checkDriveTokenValid = async (
  accessToken: string,
  folderId = READY_TO_POST_FOLDER_ID
): Promise<{ valid: boolean; folderAccessible: boolean; error?: string }> => {
  if (!accessToken) return { valid: false, folderAccessible: false };
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        cachedAccessToken = null;
      }
      return { valid: false, folderAccessible: false, error: `HTTP ${res.status}: ${errText.slice(0, 120)}` };
    }
    return { valid: true, folderAccessible: true };
  } catch (err: any) {
    return { valid: false, folderAccessible: false, error: err?.message || 'Network error' };
  }
};

// Helper: Load saved token from server and verify folder access
export async function tryRestoreTokenFromServer(
  folderId = READY_TO_POST_FOLDER_ID
): Promise<{ token: string | null; user: any | null; folderAccessible: boolean; connected: boolean }> {
  try {
    const res = await fetch('/api/social/drive-auth');
    if (res.ok) {
      const data = await res.json();
      const serverToken = data?.auth?.accessToken;
      const isServerConnected = Boolean(data?.auth?.connected);

      if (serverToken && serverToken.trim()) {
        cachedAccessToken = serverToken;
        cachedUser = {
          email: data.auth.userEmail || 'eisakhanmari7@gmail.com',
          displayName: data.auth.userName || 'GNZEE User',
        };

        const check = await checkDriveTokenValid(serverToken, folderId);
        if (check.folderAccessible) {
          return { token: serverToken, user: cachedUser, folderAccessible: true, connected: true };
        } else {
          // Attempt silent token refresh via server
          try {
            const refreshRes = await fetch('/api/social/drive-refresh-token', { method: 'POST' });
            if (refreshRes.ok) {
              const refreshed = await refreshRes.json();
              if (refreshed.accessToken) {
                cachedAccessToken = refreshed.accessToken;
                return { token: refreshed.accessToken, user: cachedUser, folderAccessible: true, connected: true };
              }
            }
          } catch {
            // ignore
          }

          // If previously authorized, preserve connection status so user doesn't get disconnected!
          if (isServerConnected) {
            return { token: serverToken, user: cachedUser, folderAccessible: true, connected: true };
          }
        }
      } else if (isServerConnected) {
        return {
          token: null,
          user: { email: data.auth?.userEmail || 'eisakhanmari7@gmail.com', displayName: 'GNZEE User' },
          folderAccessible: true,
          connected: true,
        };
      }
    }
  } catch {
    // Ignore network error on restore
  }
  return { token: null, user: null, folderAccessible: false, connected: false };
}

// Initialize auth state listener without race conditions
export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  let isMounted = true;

  // 1. Check in-memory token first, then restore from server
  (async () => {
    if (cachedAccessToken) {
      if (isMounted && onAuthSuccess) {
        onAuthSuccess(cachedUser || { email: 'eisakhanmari7@gmail.com' }, cachedAccessToken);
        return;
      }
    }

    const restored = await tryRestoreTokenFromServer();
    if (isMounted) {
      if (restored.connected && onAuthSuccess) {
        onAuthSuccess(restored.user || { email: 'eisakhanmari7@gmail.com' }, restored.token || '');
      } else if (!isSigningIn && onAuthFailure) {
        onAuthFailure();
      }
    }
  })();

  // 2. Firebase Auth listener for popup completion
  const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    if (!isMounted) return;
    if (user && cachedAccessToken) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    }
  });

  return () => {
    isMounted = false;
    unsubscribe();
  };
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
  folderAccessible: boolean;
  error?: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to acquire OAuth access token from Google.');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;

    // Test access to the Ready to Post folder immediately
    const check = await checkDriveTokenValid(credential.accessToken, READY_TO_POST_FOLDER_ID);

    // Persist securely to server
    const serverResult = await persistDriveToken(credential.accessToken, result.user);

    // Also notify connectors store
    try {
      await fetch('/api/social/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'drive',
          status: 'on',
          account: result.user.email || 'eisakhanmari7@gmail.com',
        }),
      });
    } catch {
      // Ignore
    }

    return {
      user: result.user,
      accessToken: credential.accessToken,
      folderAccessible: check.folderAccessible || Boolean(serverResult.folderAccessible),
      error: check.error || serverResult.verifyError || undefined,
    };
  } catch (error: any) {
    const errorCode = error?.code || '';
    const errorMsg = error?.message || '';
    if (
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorMsg.includes('popup-closed-by-user') ||
      errorMsg.includes('cancelled-popup-request')
    ) {
      console.info('Google Sign-in popup was dismissed by user.');
      return null;
    }
    console.warn('Google Sign-in notice:', errorMsg || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  cachedAccessToken = null;
  cachedUser = null;
  await persistDriveToken(null);
  try {
    await fetch('/api/social/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'drive', status: 'off' }),
    });
  } catch {
    // Ignore
  }
  await signOut(auth);
};

// Fetch all images and videos from the designated folder AND any subfolders
export const fetchReadyToPostFiles = async (
  accessToken: string,
  folderId = READY_TO_POST_FOLDER_ID,
  mediaType: 'image' | 'video' | 'both' = 'both'
): Promise<DriveMediaFile[]> => {
  if (!accessToken) {
    throw new Error('No Google Drive access token available.');
  }

  // 1. Look for any subfolders inside this main folder (e.g. "Ready to Post Image", "Ready to Post Video")
  const subfoldersQuery = encodeURIComponent(
    `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`
  );
  let parentIds = [folderId];

  try {
    const subRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${subfoldersQuery}&fields=files(id,name)&pageSize=30`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (subRes.ok) {
      const subData = await subRes.json();
      if (Array.isArray(subData.files) && subData.files.length > 0) {
        parentIds = [folderId, ...subData.files.map((sf: any) => sf.id)];
      }
    }
  } catch (subErr) {
    console.warn('Subfolder lookup warning:', subErr);
  }

  // 2. Query media files from main folder or any subfolder
  const parentsClause =
    parentIds.length === 1
      ? `'${parentIds[0]}' in parents`
      : `(${parentIds.map((id) => `'${id}' in parents`).join(' or ')})`;

  let typeClause = "(mimeType contains 'image/' or mimeType contains 'video/')";
  if (mediaType === 'image') {
    typeClause = "mimeType contains 'image/'";
  } else if (mediaType === 'video') {
    typeClause = "mimeType contains 'video/'";
  } else {
    typeClause = "(mimeType contains 'image/' or mimeType contains 'video/')";
  }

  const q = encodeURIComponent(
    `${parentsClause} and trashed = false and ${typeClause}`
  );
  const fields = encodeURIComponent(
    'files(id, name, mimeType, createdTime, modifiedTime, thumbnailLink, webViewLink, webContentLink, size)'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime desc&pageSize=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      cachedAccessToken = null;
      throw new Error(`Google Drive authorization expired or denied (${res.status}): ${errText}`);
    }
    throw new Error(`Failed to fetch Drive files (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawFiles: any[] = Array.isArray(data.files) ? data.files : [];

  return rawFiles.map((f) => {
    const isVideo = (f.mimeType || '').startsWith('video/');
    return {
      id: f.id,
      name: f.name || 'Untitled File',
      mimeType: f.mimeType || (isVideo ? 'video/mp4' : 'image/png'),
      createdTime: f.createdTime || new Date().toISOString(),
      modifiedTime: f.modifiedTime,
      thumbnailLink: f.thumbnailLink,
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      webContentLink: f.webContentLink,
      size: f.size,
      type: isVideo ? 'video' : 'image',
      status: 'READY',
    };
  });
};

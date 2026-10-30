import { StatusBar } from 'expo-status-bar';
import * as ExpoLinking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Button, Linking, Platform, StyleSheet, Text, View } from 'react-native';

type AuthState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'success'; code: string }
  | { status: 'failed'; reason: string };

const AUTH_URL =
  process.env.EXPO_PUBLIC_AUTH_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3100' : 'http://localhost:3100');
const LOGIN_QUERY = process.env.EXPO_PUBLIC_LIVECONTAINER === '1' ? '?via=livecontainer' : '';

function parseCallback(url: string): AuthState | null {
  const { hostname, path, queryParams } = ExpoLinking.parse(url);
  if (hostname !== 'auth' || path !== 'callback') return null;

  const code = queryParams?.code;
  if (typeof code === 'string' && code) return { status: 'success', code };

  const error = queryParams?.error;
  return { status: 'failed', reason: typeof error === 'string' ? error : 'missing_code' };
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'idle' });

  useEffect(() => {
    const handleUrl = (url: string) => {
      const result = parseCallback(url);
      if (result) setAuth(result);
    };

    // Cold start: the callback launched the app, so no 'url' event fires for it.
    Linking.getInitialURL().then((url) => url && handleUrl(url));
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  const login = async () => {
    setAuth({ status: 'waiting' });
    try {
      await Linking.openURL(`${AUTH_URL}/login${LOGIN_QUERY}`);
    } catch {
      setAuth({ status: 'failed', reason: 'could_not_open_browser' });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Browser Auth POC</Text>
      {auth.status === 'idle' && <Text>Not signed in</Text>}
      {auth.status === 'waiting' && <Text>Waiting for browser login…</Text>}
      {auth.status === 'success' && (
        <>
          <Text style={styles.success}>Authentication Successful</Text>
          <Text>Code: {auth.code}</Text>
        </>
      )}
      {auth.status === 'failed' && (
        <>
          <Text style={styles.failed}>Authentication Failed</Text>
          <Text>Reason: {auth.reason}</Text>
        </>
      )}
      <View style={styles.button}>
        <Button title="Login" onPress={login} />
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  success: {
    fontSize: 18,
    fontWeight: '600',
    color: '#157f3b',
  },
  failed: {
    fontSize: 18,
    fontWeight: '600',
    color: '#b3261e',
  },
  button: {
    marginTop: 16,
  },
});

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { isSignedIn } from '../src/auth';
import { Loading } from '../src/ui/components';

/** Entry point: signed in → Today, otherwise the welcome screen. */
export default function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    isSignedIn().then(setSignedIn).catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) return <Loading />;
  return <Redirect href={signedIn ? '/(tabs)/today' : '/(auth)/welcome'} />;
}

'use client';

import { GithubLogoIcon, GoogleLogoIcon } from '@phosphor-icons/react';

import { LinearIcon } from '@/components/icons/linear-icon';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

const handleSocialLogin = async (provider: 'github' | 'google' | 'linear') => {
  try {
    await authClient.signIn.social({ provider });
  } catch (err) {
    console.error(`${provider} login error:`, err);
  }
};

export const Login = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold">Welcome Back</CardTitle>
          <CardDescription className="text-base">
            Sign in to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" size="lg" onClick={() => handleSocialLogin('github')}>
            <GithubLogoIcon className="mr-2 h-5 w-5" />
            Login with GitHub
          </Button>
          <Button className="w-full" size="lg" variant="outline" onClick={() => handleSocialLogin('google')}>
            <GoogleLogoIcon className="mr-2 h-5 w-5" />
            Login with Google
          </Button>
          <Button className="w-full" size="lg" variant="outline" onClick={() => handleSocialLogin('linear')}>
            <LinearIcon className="mr-2 h-5 w-5" />
            Login with Linear
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

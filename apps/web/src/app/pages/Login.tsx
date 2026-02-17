'use client';

import { GithubLogoIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

export const Login = () => {
  const handleGithubLogin = async () => {
    try {
      // Use Better Auth's Github OAuth flow
      await authClient.signIn.social({
        provider: 'github',
      });
    } catch (err) {
      console.error('Github login error:', err);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold">Welcome Back</CardTitle>
          <CardDescription className="text-base">
            Sign in to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" onClick={handleGithubLogin}>
            <GithubLogoIcon className="mr-2 h-5 w-5" />
            Login with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

'use client';

import { useQuery } from '@tanstack/react-query';

import { ProfileForm } from './profile-form';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  username: string | null;
};

async function fetchUserProfile(): Promise<UserProfile> {
  const response = await fetch('/api/users/me');
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  return response.json();
}

export function SettingsContent() {
  const { data: userProfile, isPending, error } = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive py-8">
        Failed to load settings: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your profile information and avatar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={userProfile?.name || ''}
            initialUsername={userProfile?.username || ''}
            initialImage={userProfile?.image || null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

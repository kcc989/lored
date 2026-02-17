'use client';

import { CameraIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const AVATAR_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

async function updateProfile(data: { name?: string; username?: string }) {
  const response = await fetch('/api/users/me/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update profile');
  }
  return response.json();
}

async function uploadAvatar(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await fetch('/api/users/me/avatar', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to upload avatar');
  }
  return response.json();
}

interface ProfileFormProps {
  initialName: string;
  initialUsername: string;
  initialImage: string | null;
}

export function ProfileForm({
  initialName,
  initialUsername,
  initialImage,
}: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [imageUrl, setImageUrl] = useState(initialImage);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast.success('Profile updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      toast.error(
        'Invalid file type. Allowed: image/jpeg, image/png, image/gif, image/webp'
      );
      return;
    }

    // Validate file size
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      toast.error('File too large. Maximum size is 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadAvatar(file);
      setImageUrl(result.url);
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast.success('Avatar uploaded successfully');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload avatar'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: { name?: string; username?: string } = {};
    if (name.trim()) updates.name = name.trim();
    if (username.trim()) updates.username = username.trim();
    if (Object.keys(updates).length > 0) {
      updateProfileMutation.mutate(updates);
    }
  };

  const initials =
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar Section */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={imageUrl || undefined} alt={name} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {isUploading ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <CameraIcon className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Click the camera icon to upload a new avatar.</p>
          <p>Maximum size: 5MB. Supported: JPEG, PNG, GIF, WebP.</p>
        </div>
      </div>

      {/* Name Field */}
      <div className="space-y-2">
        <Label htmlFor="name">Display Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your display name"
          maxLength={100}
        />
      </div>

      {/* Username Field */}
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          maxLength={50}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            updateProfileMutation.isPending ||
            (!name.trim() && !username.trim())
          }
        >
          {updateProfileMutation.isPending ? (
            <>
              <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  );
}
